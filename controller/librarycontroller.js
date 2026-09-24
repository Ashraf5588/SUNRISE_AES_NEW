const path = require("path");
const fs = require("fs");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bs = require("bikram-sambat-js");
const { teacherSchema } = require("../model/admin");
const { studentrecordschema } = require("../model/adminschema");
const Book = require("../model/library/bookschema");
const bookcategory = require("../model/library/categoryschema");
const Member = require("../model/library/memberSchema");
const BookIssue = require("../model/library/bookIssueSchema");
const LostBook = require("../model/library/lostBookSchema");
const { generateBookCopyCodes, calculateLateFine, normalizeBookIsbn } = require("../model/library/libraryBookUtils");

const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");
const userModel = mongoose.model("userlist", teacherSchema, "users");

const normalizeText = (value = "") => String(value || "").trim();

const normalizeCategoryColorHex = (value = "") => {
  const hex = normalizeText(value);
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) {
    return "#2563eb";
  }
  return hex;
};

const toNepaliDate = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const bsDate = bs.ADToBS(date);
  return String(bsDate).slice(0, 10);
};

const toADDate = (bsDateString) => {
  if (!bsDateString) return null;
  try {
    const adDate = bs.BSToAD(bsDateString);
    if (!adDate || adDate === "Invalid" || adDate === "Invalid Date") return null;
    const parsedDate = new Date(adDate);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return parsedDate;
  } catch (error) {
    return null;
  }
};

const parseReturnDateValue = (value) => {
  const rawValue = normalizeText(value);
  if (!rawValue) return new Date();

  const adDate = toADDate(rawValue);
  if (adDate) return adDate;

  const directDate = new Date(rawValue);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  return new Date();
};

const getPreferredStudentContact = (student = {}) => {
  const candidates = [
    student.fatherMobile,
    student.motherMobile,
    student.fatherContact,
    student.motherContact,
    student.otherguardianContact,
    student.numberofmobile,
    student.contactNumber,
    student.mobile,
    student.phone,
  ];

  return normalizeText(candidates.find((value) => normalizeText(value)) || "");
};

const getStudentAddress = (student = {}) => normalizeText(student.address || student.studentAddress || "");

const buildMemberSearchResult = (entry, source) => {
  const base = {
    source,
    memberType: source === "student" ? "student" : "staff",
    name: source === "student" ? normalizeText(entry.name) : normalizeText(entry.teacherName || entry.username),
    contactNumber: source === "student" ? getPreferredStudentContact(entry) : normalizeText(entry.fatherMobile || entry.motherMobile || entry.contactNumber || entry.mobile || ""),
    address: source === "student" ? getStudentAddress(entry) : normalizeText(entry.address || ""),
    email: normalizeText(entry.email || ""),
    notes: "",
  };

  if (source === "student") {
    return {
      ...base,
      studentId: entry._id,
      reg: normalizeText(entry.reg),
      studentClass: normalizeText(entry.studentClass),
      section: normalizeText(entry.section),
      address: getStudentAddress(entry),
      memberType: "student"
    };
  }

  return {
    ...base,
    staffId: entry._id,
    username: normalizeText(entry.username),
    teacherId: normalizeText(entry.teacherId),
    memberType: "staff"
  };
};

exports.libraryDashboard = async (req, res) => {
  try {
    const [books, categories, members, allIssues] = await Promise.all([
      Book.find().sort({ title: 1 }).lean(),
      bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean(),
      Member.find().sort({ createdAt: -1 }).lean(),
      BookIssue.find().sort({ issuedAt: -1 }).lean()
    ]);

    const activeIssues = allIssues.filter((issue) => issue.status === "issued");
    const overdueBooks = activeIssues.filter((issue) => issue.dueDate && new Date(issue.dueDate) < new Date()).length;
    const returnedBooks = allIssues.filter((issue) => issue.status === "returned").length;
    const totalBooks = books.reduce((sum, book) => sum + (Number(book.totalQuantity) || 0), 0);
    const availableBooks = books.reduce((sum, book) => sum + (Number(book.availableQuantity) || 0), 0);
    const totalMembers = members.length;

    const categorySummary = categories
      .map((category) => {
        const count = books
          .filter((book) => String(book.category || "") === String(category.name || ""))
          .reduce((sum, book) => sum + (Number(book.totalQuantity) || 0), 0);
        return { name: category.name, count };
      })
      .filter((item) => item.count > 0);

    const issuedPct = totalBooks ? Math.round((activeIssues.length / totalBooks) * 100) : 0;
    const availablePct = totalBooks ? Math.round((availableBooks / totalBooks) * 100) : 0;

    res.render("library/librarydashboard", {
      books,
      categories,
      members,
      activeIssues,
      allIssues,
      totalBooks,
      availableBooks,
      totalMembers,
      totalIssues: allIssues.length,
      issuedBooks: activeIssues.length,
      overdueBooks,
      returnedBooks,
      issuedPct,
      availablePct,
      categorySummary,
      searchQuery: "",
      searchResults: []
    });
  } catch (error) {
    console.error("Error loading library dashboard:", error);
    res.status(500).send("Error loading library dashboard.");
  }
};

exports.libraryAnalytics = async (req, res) => {
  try {
    const [books, issues, members] = await Promise.all([
      Book.find().sort({ title: 1 }).lean(),
      BookIssue.find().sort({ issuedAt: -1 }).lean(),
      Member.find().sort({ membershipDate: -1, createdAt: -1 }).lean()
    ]);

    const bookMap = new Map(books.map((book) => [String(book._id), book]));
    const circulationCategories = issues.map((issue) => normalizeText(bookMap.get(String(issue.bookId))?.category) || 'Uncategorized');
    const categoryNames = Array.from(new Set([
      ...books.map((book) => normalizeText(book.category)).filter(Boolean),
      ...circulationCategories
    ])).sort();
    const monthNames = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
    const monthRows = monthNames.map((month, index) => {
      const row = { month, categories: Object.fromEntries(categoryNames.map((category) => [category, 0])), total: 0 };
      issues.forEach((issue) => {
        if (!issue.issuedAt) return;
        const bsValue = toNepaliDate(issue.issuedAt);
        const monthNumber = Number(String(bsValue).split('-')[1]);
        if (monthNumber !== index + 1) return;
        const category = normalizeText(bookMap.get(String(issue.bookId))?.category) || 'Uncategorized';
        if (row.categories[category] === undefined) row.categories[category] = 0;
        row.categories[category] += Number(issue.quantity || 0);
        row.total += Number(issue.quantity || 0);
      });
      return row;
    });

    const shelfMap = new Map();
    books.forEach((book) => {
      const shelf = normalizeText(book.shelvesNo) || 'Unassigned';
      shelfMap.set(shelf, (shelfMap.get(shelf) || 0) + Number(book.totalQuantity || 0));
    });
    const shelfRows = Array.from(shelfMap, ([shelvesNo, totalBooks]) => ({ shelvesNo, totalBooks }))
      .sort((a, b) => a.shelvesNo.localeCompare(b.shelvesNo));

    const now = new Date();
    const dueBooks = issues.filter((issue) => issue.status === 'issued' && issue.dueDate && new Date(issue.dueDate) < now).map((issue) => {
      const member = members.find((item) => String(item._id) === String(issue.memberId));
      const dueDate = new Date(issue.dueDate);
      const daysLate = Math.max(1, Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)));
      return {
        bookName: issue.bookTitle,
        bookCode: (issue.bookCodes || []).join(', '),
        memberName: issue.memberName,
        dueDate: toNepaliDate(issue.dueDate),
        daysLate,
        contactNumber: member?.contactNumber || '',
        address: member?.address || ''
      };
    });

    const feeRows = members.filter((member) => Number(member.membershipCollected || 0) > 0).map((member) => ({
      date: member.membershipDate ? toNepaliDate(member.membershipDate) : toNepaliDate(member.createdAt),
      memberName: member.name,
      amount: Number(member.membershipCollected || 0)
    }));
    const feeTotal = feeRows.reduce((sum, row) => sum + row.amount, 0);
    const fineRows = issues.filter((issue) => Number(issue.fineAmount || 0) > 0).map((issue) => ({
      date: issue.returnedAt ? toNepaliDate(issue.returnedAt) : toNepaliDate(issue.issuedAt),
      memberName: issue.memberName,
      amount: Number(issue.fineAmount || 0),
      reason: issue.isLate ? `Late by ${issue.daysLate || 0} day(s)` : (issue.notes || 'Fine recorded')
    }));
    const fineTotal = fineRows.reduce((sum, row) => sum + row.amount, 0);

    res.render('library/libraryanalytics', {
      shelfRows,
      categoryNames,
      monthRows,
      dueBooks,
      feeRows,
      feeTotal,
      fineRows,
      fineTotal,
      totalBooks: books.reduce((sum, book) => sum + Number(book.totalQuantity || 0), 0),
      totalCopiesAvailable: books.reduce((sum, book) => sum + Number(book.availableQuantity || 0), 0)
    });
  } catch (error) {
    console.error('Error loading library analytics:', error);
    res.status(500).send('Error loading library analytics.');
  }
};

exports.listCategories = async (req, res) => {
  try {
    const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
    res.render("library/category", { categories, success: "", error: "" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories.", error });
  }
};

exports.addCategory = async (req, res) => {
  try {
    const name = normalizeText(req.body.name);
    const description = normalizeText(req.body.description);
    const requiredPercentage = Number(req.body.requiredPercentage || 0);
    const displayOrder = Number(req.body.displayOrder || 0);
    const colorName = normalizeText(req.body.colorName);
    const colorHex = normalizeCategoryColorHex(req.body.colorHex);

    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }
    if (!Number.isFinite(requiredPercentage) || requiredPercentage < 0 || requiredPercentage > 100 || !Number.isInteger(displayOrder) || displayOrder < 0) {
      return res.status(400).json({ message: "Required percentage must be 0-100 and display order must be a non-negative whole number." });
    }

    const exists = await bookcategory.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
    if (exists) {
      return res.status(400).json({ message: "This category already exists." });
    }

    const category = new bookcategory({ name, description, requiredPercentage, displayOrder, colorName, colorHex });
    await category.save();
    return res.redirect("/library/categories");
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Error adding category.", error });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await bookcategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    const name = normalizeText(req.body.name);
    const requiredPercentage = Number(req.body.requiredPercentage || 0);
    const displayOrder = Number(req.body.displayOrder || 0);
    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }
    if (!Number.isFinite(requiredPercentage) || requiredPercentage < 0 || requiredPercentage > 100 || !Number.isInteger(displayOrder) || displayOrder < 0) {
      return res.status(400).json({ message: "Required percentage must be 0-100 and display order must be a non-negative whole number." });
    }

    const duplicate = await bookcategory.findOne({
      _id: { $ne: category._id },
      name: { $regex: new RegExp(`^${name}$`, "i") }
    });

    if (duplicate) {
      return res.status(400).json({ message: "This category name already exists." });
    }

    category.name = name;
    category.description = normalizeText(req.body.description);
    category.requiredPercentage = requiredPercentage;
    category.displayOrder = displayOrder;
    category.colorName = normalizeText(req.body.colorName);
    category.colorHex = normalizeCategoryColorHex(req.body.colorHex);
    await category.save();

    return res.json({ message: "Category updated successfully." });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({ message: "Error updating category.", error });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await bookcategory.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    return res.json({ message: "Category deleted successfully." });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ message: "Error deleting category.", error });
  }
};

exports.listBooks = async (req, res) => {
  try {
    const books = await Book.find().sort({ title: 1 }).lean();
    const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
    const categoryColors = new Map(categories.map((category) => [String(category.name || '').trim().toLowerCase(), category.colorHex || '#2563eb']));
    const booksWithCategoryColor = books.map((book) => ({
      ...book,
      categoryDisplayColor: categoryColors.get(String(book.category || '').trim().toLowerCase()) || book.categoryColor || '#2563eb'
    }));
    res.render("library/addbook", { books: booksWithCategoryColor, categories, success: "", error: "" });
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).json({ message: "Error fetching books.", error });
  }
};

exports.getBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) {
      return res.status(404).json({ message: "Book not found." });
    }
    return res.json(book);
  } catch (error) {
    console.error("Error fetching book:", error);
    res.status(500).json({ message: "Error fetching book.", error });
  }
};

exports.updateBook = async (req, res) => {
  try {
    const bookId = req.params.id;
    const existingBook = await Book.findById(bookId);
    if (!existingBook) {
      return res.status(404).json({ message: "Book not found." });
    }

    const title = normalizeText(req.body.title || existingBook.title);
    const author = normalizeText(req.body.author || existingBook.author || "");
    const isbn = normalizeBookIsbn(req.body.isbn ?? existingBook.isbn ?? "");
    const safeIsbn = isbn || undefined;
    const category = normalizeText(req.body.category || existingBook.category || "");
    const categoryColor = normalizeCategoryColorHex(req.body.categoryColor || existingBook.categoryColor || "#2563eb");
    const shelvesNo = normalizeText(req.body.shelvesNo || existingBook.shelvesNo || "");
    const publisherName = normalizeText(req.body.publisherName || existingBook.publisherName || "");
    const publishedYear = normalizeText(req.body.publishedYear || existingBook.publishedYear || "");
    const date = normalizeText(req.body.date || existingBook.date || "");
    const edition = normalizeText(req.body.edition || existingBook.edition || "");
    const page = normalizeText(req.body.page || existingBook.page || "");
    const source = normalizeText(req.body.source || existingBook.source || "");
    const remarks = normalizeText(req.body.remarks || existingBook.remarks || "");
    const price = Number(req.body.price || existingBook.price || 0);
    const totalQuantity = Number(req.body.totalQuantity || existingBook.totalQuantity || 0);

    if (!title || !category || !Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      return res.status(400).json({ message: "Please provide a valid title, category and quantity." });
    }

    existingBook.title = title;
    existingBook.author = author;
    existingBook.isbn = safeIsbn;
    existingBook.category = category;
    existingBook.categoryColor = categoryColor;
    existingBook.shelvesNo = shelvesNo;
    existingBook.publisherName = publisherName;
    existingBook.publishedYear = publishedYear;
    existingBook.date = date;
    existingBook.edition = edition;
    existingBook.page = page;
    existingBook.source = source;
    existingBook.remarks = remarks;
    existingBook.price = price;
    existingBook.totalQuantity = totalQuantity;

    await existingBook.save();
    return res.status(200).json({ message: "Book updated successfully.", book: existingBook });
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).json({ message: "Error updating book.", error });
  }
};

exports.deleteBook = async (req, res) => {
  try {
    const deleted = await Book.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Book not found." });
    }
    return res.status(200).json({ message: "Book deleted successfully." });
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ message: "Error deleting book.", error });
  }
};

exports.inventoryPage = async (req, res) => {
  try {
    const books = await Book.find().sort({ title: 1 }).lean();
    const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
    const filter = normalizeText(req.query.filter || "");
    const categoryFilter = normalizeText(req.query.category || "");
    const lowStockOnly = req.query.lowStockOnly === "1";

    let filteredBooks = books.filter((book) => {
      const copyCodes = (book.bookCodes || []).map((copy) => copy.code);
      const matchesFilter = !filter || [book.title, book.author, book.category, book.shelvesNo, book.publisherName, book.isbn, book.bookCodePrefix, ...copyCodes].some((value) => String(value || "").toLowerCase().includes(filter.toLowerCase()));
      const matchesCategory = !categoryFilter || String(book.category || "").toLowerCase() === categoryFilter.toLowerCase();
      const matchesLowStock = !lowStockOnly || Number(book.availableQuantity) <= 2;
      return matchesFilter && matchesCategory && matchesLowStock;
    });

    res.render("library/bookinventory", {
      books: filteredBooks,
      allBooks: books,
      categories,
      filter,
      categoryFilter,
      lowStockOnly,
      success: "",
      error: ""
    });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).send("Error loading book inventory.");
  }
};

exports.addBooks = async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const author = normalizeText(req.body.author || "");
    const isbn = normalizeBookIsbn(req.body.isbn ?? "");
    const safeIsbn = isbn || undefined;
    const category = normalizeText(req.body.category || "");
    const categoryColor = normalizeCategoryColorHex(req.body.categoryColor || "#2563eb");
    const shelvesNo = normalizeText(req.body.shelvesNo || "");
    const publisherName = normalizeText(req.body.publisherName || "");
    const publishedYear = normalizeText(req.body.publishedYear || "");
    const date = normalizeText(req.body.date || "");
    const edition = normalizeText(req.body.edition || "");
    const page = normalizeText(req.body.page || "");
    const source = normalizeText(req.body.source || "");
    const remarks = normalizeText(req.body.remarks || "");
    const price = Number(req.body.price || 0);
    const totalQuantity = Number(req.body.totalQuantity || req.body.quantity || 0);

    if (!title || !category || !Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      return res.status(400).json({ message: "Please provide valid book title, category and quantity." });
    }

    if (isbn) {
      const existingBook = await Book.findOne({ isbn: { $regex: new RegExp(`^${isbn}$`, "i") } });
      if (existingBook) {
        return res.status(400).json({ message: "A book with this ISBN already exists." });
      }
    }

    const existingBookByTitleAndAuthor = await Book.findOne({
      title: { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
    });

    if (existingBookByTitleAndAuthor) {
      return res.status(409).json({
        message: "This book is already registered. Use Add Stock to increase its quantity without creating duplicate registration codes.",
        bookId: existingBookByTitleAndAuthor._id
      });
    }

    const newBook = new Book({
      title,
      author,
      isbn: safeIsbn,
      category,
      categoryColor,
      shelvesNo,
      publisherName,
      publishedYear,
      date,
      edition,
      page,
      source,
      remarks,
      price,
      availableQuantity: totalQuantity,
      totalQuantity,
    });

    await newBook.save();
    res.status(201).json({ message: "Book added successfully.", book: newBook });
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).json({ message: "Error adding book.", error });
  }
};

exports.downloadBookCsvTemplate = (req, res) => {
  const headers = ['date', 'title', 'author', 'isbn', 'category', 'categoryColor', 'shelvesNo', 'publisherName', 'publishedYear', 'edition', 'page', 'source', 'remarks', 'price', 'totalQuantity'];
  const example = ['2082-01-01', 'Example Book', 'Author Name', '', 'Science', '#2563eb', 'A-01', 'Publisher', '2082', 'First', '250', 'Purchase', '', '500', '1'];
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="book-import-template.csv"').send(`${headers.join(',')}\n${example.join(',')}\n`);
};

exports.importBooksCsv = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: 'Please select a CSV file.' });

    const csvText = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = await require('csvtojson')({ trim: true }).fromString(csvText);
    if (!rows.length) return res.status(400).json({ message: 'The CSV file has no data rows.' });

    let imported = 0;
    const errors = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const title = normalizeText(row.title);
      const category = normalizeText(row.category);
      const quantity = Number(row.totalQuantity || 1);
      if (!title || !category || !Number.isInteger(quantity) || quantity <= 0) {
        errors.push(`Row ${index + 2}: title, category, and a positive whole totalQuantity are required.`);
        continue;
      }

      const author = normalizeText(row.author);
      const publisherName = normalizeText(row.publisherName);
      const categoryRecord = await bookcategory.findOne({ name: { $regex: new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).lean();
      const requestedCategoryColor = normalizeText(row.categoryColor);
      const categoryColor = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(requestedCategoryColor)
        ? requestedCategoryColor
        : (categoryRecord?.colorHex || '#2563eb');
      const existing = await Book.findOne({
        title: { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        author: { $regex: new RegExp(`^${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        category: { $regex: new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        publisherName: { $regex: new RegExp(`^${publisherName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

      const bookData = {
        title, author, isbn: normalizeBookIsbn(row.isbn), category, categoryColor,
        shelvesNo: normalizeText(row.shelvesNo), publisherName,
        publishedYear: normalizeText(row.publishedYear), date: normalizeText(row.date),
        edition: normalizeText(row.edition), page: normalizeText(row.page),
        source: normalizeText(row.source), remarks: normalizeText(row.remarks),
        price: Number(row.price || 0)
      };

      if (existing) {
        existing.totalQuantity += quantity;
        Object.assign(existing, bookData);
        await existing.save();
      } else {
        await new Book({ ...bookData, availableQuantity: quantity, totalQuantity: quantity }).save();
      }
      imported += 1;
    }

    res.status(errors.length ? 207 : 201).json({ message: `${imported} book row(s) imported. Codes were generated automatically.`, imported, errors });
  } catch (error) {
    console.error('Error importing books CSV:', error);
    res.status(500).json({ message: 'Error importing books CSV.', error });
  }
};

exports.searchMembers = async (req, res) => {
  try {
    const query = normalizeText(req.body?.search || req.query?.search || req.body?.q || req.body?.name || "");

    if (!query || query.length < 2) {
      const members = await Member.find().sort({ createdAt: -1 }).lean();
      const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.json({ results: [] });
      }
      return res.render("library/members", {
        members,
        categories,
        searchQuery: query,
        searchResults: [],
        error: query ? "Type at least 2 letters to search." : "Please enter a student or staff name to search.",
        success: ""
      });
    }

    const studentRegex = new RegExp(query, "i");
    const staffRegex = new RegExp(query, "i");

    const [students, staffMembers] = await Promise.all([
      studentRecord.find({ name: studentRegex }).limit(10).lean(),
      userModel.find({
        $or: [
          { teacherName: staffRegex },
          { username: staffRegex },
          { teacherId: staffRegex }
        ]
      }).limit(10).lean()
    ]);

    const searchResults = [
      ...students.map((student) => buildMemberSearchResult(student, "student")),
      ...staffMembers.map((staff) => buildMemberSearchResult(staff, "staff"))
    ];

    const members = await Member.find().sort({ createdAt: -1 }).lean();

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ results: searchResults.slice(0, 10) });
    }

    res.render("library/members", {
      members,
      categories: await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean(),
      searchQuery: query,
      searchResults,
      error: searchResults.length ? "" : "No matching student or staff found. You can add a new member manually below.",
      success: ""
    });
  } catch (error) {
    console.error("Error searching members:", error);
    res.status(500).send("Error searching members.");
  }
};

exports.createMember = async (req, res) => {
  try {
    const memberType = (req.body.memberType || "student").toLowerCase();
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ message: "Member name is required." });
    }

    const normalized = {
      memberType,
      name,
      contactNumber: normalizeText(req.body.contactNumber || ""),
      address: normalizeText(req.body.address || ""),
      email: normalizeText(req.body.email || ""),
      membershipFee: Number(req.body.membershipFee || 0),
      membershipCollected: Number(req.body.membershipCollected || 0),
      membershipDate: req.body.membershipDate ? toADDate(req.body.membershipDate) || new Date(req.body.membershipDate) : null,
      notes: normalizeText(req.body.notes || ""),
      status: "active"
    };

    if (memberType === "student") {
      normalized.studentReg = normalizeText(req.body.studentReg || "");
      normalized.studentClass = normalizeText(req.body.studentClass || "");
      normalized.section = normalizeText(req.body.section || "");
    }

    if (memberType === "staff") {
      normalized.staffUsername = normalizeText(req.body.staffUsername || "");
      normalized.staffId = normalizeText(req.body.staffId || "");
    }

    const existing = await Member.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        ...(normalized.studentReg ? [{ studentReg: normalized.studentReg }] : []),
        ...(normalized.staffUsername ? [{ staffUsername: normalized.staffUsername }] : [])
      ]
    });

    if (existing) {
      return res.status(400).json({ message: "This member already exists in the library system." });
    }

    const member = await Member.create(normalized);
    res.status(201).json({ message: "Member added successfully.", member });
  } catch (error) {
    console.error("Error creating member:", error);
    res.status(500).json({ message: "Error creating member.", error });
  }
};

exports.getStudentRecordContact = async (req, res) => {
  try {
    const reg = normalizeText(req.query.reg || "");
    const name = normalizeText(req.query.name || "");
    const studentClass = normalizeText(req.query.studentClass || "");
    const section = normalizeText(req.query.section || "");

    if (!reg && !name && !studentClass && !section) {
      return res.json({ contactNumber: "" });
    }

    const query = {};
    if (reg) query.reg = { $regex: new RegExp(`^${reg}$`, "i") };
    if (name) query.name = { $regex: new RegExp(`^${name}$`, "i") };
    if (studentClass) query.studentClass = { $regex: new RegExp(`^${studentClass}$`, "i") };
    if (section) query.section = { $regex: new RegExp(`^${section}$`, "i") };

    const student = await studentRecord.findOne(query).lean();
    const contactNumber = student ? getPreferredStudentContact(student) : "";
    const address = student ? getStudentAddress(student) : "";
    return res.json({ contactNumber, address });
  } catch (error) {
    console.error("Error fetching student contact:", error);
    res.status(500).json({ message: "Error fetching student contact.", error });
  }
};

exports.listMembers = async (req, res) => {
  try {
    const members = await Member.find().sort({ createdAt: -1 }).lean();
    const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
    res.render("library/members", {
      members,
      categories,
      searchQuery: "",
      searchResults: [],
      error: "",
      success: ""
    });
  } catch (error) {
    console.error("Error listing members:", error);
    res.status(500).send("Error listing members.");
  }
};

exports.listIssues = async (req, res) => {
  try {
    const [issues, books, members] = await Promise.all([
      BookIssue.find().sort({ issuedAt: -1 }).lean(),
      Book.find().sort({ title: 1 }).lean(),
      Member.find().sort({ createdAt: -1 }).lean()
    ]);

    const bookMap = new Map((books || []).map((book) => [String(book._id), book]));

    const normalizedIssues = issues.map((issue) => {
      const book = bookMap.get(String(issue.bookId));
      return {
        ...issue,
        bookPrice: Number(book?.price || 0),
        nepaliIssuedAt: toNepaliDate(issue.issuedAt),
        nepaliDueDate: toNepaliDate(issue.dueDate),
        nepaliReturnedAt: toNepaliDate(issue.returnedAt)
      };
    });

    res.render("library/issuebook", {
      issues: normalizedIssues,
      books,
      members,
      error: "",
      success: ""
    });
  } catch (error) {
    console.error("Error listing issues:", error);
    res.status(500).send("Error listing book issues.");
  }
};

exports.assignBook = async (req, res) => {
  try {
    const memberId = req.body.memberId;
    const bookId = req.body.bookId;
    const quantity = Number(req.body.quantity || 1);
    const dueDateInput = req.body.dueDate || req.body.dueDateBS || "";
    const dueDate = dueDateInput ? toADDate(dueDateInput) || new Date(dueDateInput) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    if (!memberId || !bookId) {
      return res.status(400).json({ message: "Please select a member and a book." });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than zero." });
    }

    const [member, book] = await Promise.all([
      Member.findById(memberId),
      Book.findById(bookId)
    ]);

    if (!member) {
      return res.status(404).json({ message: "Selected member was not found." });
    }

    if (!book) {
      return res.status(404).json({ message: "Selected book was not found." });
    }

    const requestedRawCodes = Array.isArray(req.body.bookCodes)
      ? req.body.bookCodes
      : req.body.bookCode ? [req.body.bookCode] : req.body.scanBookCode ? [req.body.scanBookCode] : [];

    const requestedCodes = requestedRawCodes
      .map((code) => String(code || '').trim())
      .filter(Boolean)
      .map((code) => code.toUpperCase());

    const availableCopies = (book.bookCodes || []).filter((copy) => copy.status === "available");
    if (availableCopies.length < quantity && requestedCodes.length === 0) {
      return res.status(400).json({ message: `Only ${availableCopies.length} copies available for this book.` });
    }

    let issuedCodes = [];
    if (requestedCodes.length) {
      const invalidCodes = requestedCodes.filter((code) => {
        const match = (book.bookCodes || []).find((copy) => String(copy.code || '').toUpperCase() === code && copy.status === "available");
        return !match;
      });

      if (invalidCodes.length) {
        return res.status(400).json({ message: `Selected book code(s) not available: ${invalidCodes.join(', ')}` });
      }

      issuedCodes = requestedCodes.slice(0, quantity);
    } else {
      issuedCodes = availableCopies.slice(0, quantity).map((copy) => copy.code.toUpperCase());
    }

    issuedCodes.forEach((code) => {
      const copy = (book.bookCodes || []).find((entry) => String(entry.code || '').toUpperCase() === String(code).toUpperCase());
      if (copy) {
        copy.status = "issued";
        copy.issuedTo = member._id;
        copy.issuedAt = new Date();
        copy.issueId = null;
      }
    });

    const issue = await BookIssue.create({
      bookId: book._id,
      bookTitle: book.title,
      memberId: member._id,
      memberName: member.name,
      memberType: member.memberType,
      quantity,
      bookCodes: issuedCodes,
      issuedAt: new Date(),
      dueDate,
      status: "issued"
    });

    issuedCodes.forEach((code) => {
      const copy = (book.bookCodes || []).find((entry) => entry.code === code);
      if (copy) {
        copy.issueId = issue._id;
      }
    });

    book.availableQuantity = (book.bookCodes || []).filter((copy) => copy.status === "available").length;
    await book.save();

    res.status(201).json({ message: "Book assigned successfully.", issue });
  } catch (error) {
    console.error("Error assigning book:", error);
    res.status(500).json({ message: "Error assigning book.", error });
  }
};

exports.returnBook = async (req, res) => {
  try {
    const issue = await BookIssue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: "Issue record not found." });
    }

    if (issue.status === "returned") {
      return res.status(400).json({ message: "This book has already been returned." });
    }

    const returnQuantity = Number(req.body.returnQuantity || issue.quantity || 1);
    const conditionOnReturn = String(req.body.conditionOnReturn || "good");
    const notes = String(req.body.notes || "");
    const returnDateInput = req.body.returnDate || req.body.returnDateBS || "";
    const returnDate = parseReturnDateValue(returnDateInput);
    const fineType = String(req.body.fineType || "flat").toLowerCase();
    const fineValue = Number(req.body.fineValue ?? req.body.finePerDay ?? 0) || 0;
    const book = await Book.findById(issue.bookId);

    if (!Number.isFinite(returnQuantity) || returnQuantity <= 0) {
      return res.status(400).json({ message: "Return quantity must be greater than zero." });
    }

    const requestedCodes = Array.isArray(req.body.bookCodes) ? req.body.bookCodes : issue.bookCodes || [];
    const selectedCodes = requestedCodes.slice(0, returnQuantity);

    if (book && selectedCodes.length === 0) {
      return res.status(400).json({ message: "Please select the book code(s) being returned." });
    }

    const lateDetails = calculateLateFine({
      dueDate: issue.dueDate,
      returnDate,
      finePerDay: fineType === "flat" ? fineValue : 0,
      quantity: returnQuantity
    });

    let fineAmount = 0;
    if (fineType !== "none" && lateDetails.daysLate > 0) {
      if (fineType === "percentage") {
        const percentageValue = Number(fineValue || 0);
        const bookPrice = Number(book?.price || 0);
        fineAmount = percentageValue > 0 && bookPrice > 0
          ? (bookPrice * (percentageValue / 100)) * returnQuantity * lateDetails.daysLate
          : 0;
      } else {
        const flatValue = Number(fineValue || 0);
        fineAmount = flatValue * returnQuantity * lateDetails.daysLate;
      }
    }

    issue.status = "returned";
    issue.returnedAt = returnDate;
    issue.returnQuantity = returnQuantity;
    issue.returnedBookCodes = selectedCodes;
    issue.conditionOnReturn = conditionOnReturn;
    issue.notes = notes;
    issue.isLate = lateDetails.daysLate > 0;
    issue.daysLate = lateDetails.daysLate;
    issue.fineAmount = fineAmount;
    await issue.save();

    if (book) {
      selectedCodes.forEach((code) => {
        const copy = (book.bookCodes || []).find((entry) => String(entry.code || '').toUpperCase() === String(code || '').toUpperCase());
        if (copy) {
          copy.status = "available";
          copy.returnedAt = returnDate;
          copy.condition = conditionOnReturn;
          copy.issuedTo = null;
          copy.issuedAt = null;
          copy.issueId = null;
        }
      });

      book.availableQuantity = (book.bookCodes || []).filter((copy) => copy.status === "available").length;
      await book.save();
    }

    res.status(200).json({
      message: "Book returned successfully.",
      late: issue.isLate,
      daysLate: issue.daysLate,
      fineAmount: issue.fineAmount,
      conditionOnReturn,
      returnedBookCodes: selectedCodes
    });
  } catch (error) {
    console.error("Error returning book:", error);
    res.status(500).json({ message: "Error returning book.", error });
  }
};

exports.listBooksPage = async (req, res) => {
  try {
    const books = await Book.find().sort({ title: 1 }).lean();
    const categories = await bookcategory.find().sort({ displayOrder: 1, name: 1 }).lean();
    res.render("library/addbook", { books, categories, error: "", success: "" });
  } catch (error) {
    console.error("Error listing books page:", error);
    res.status(500).send("Error loading books page.");
  }
};

exports.updateMember = async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    const name = normalizeText(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Member name is required." });
    }

    const memberType = String(req.body.memberType || member.memberType || "student").toLowerCase();
    member.memberType = memberType === "staff" ? "staff" : "student";
    member.name = name;
    member.contactNumber = normalizeText(req.body.contactNumber || member.contactNumber || "");
    member.address = normalizeText(req.body.address || member.address || "");
    member.email = normalizeText(req.body.email || member.email || "");
    member.membershipFee = Number(req.body.membershipFee || member.membershipFee || 0);
    member.membershipCollected = Number(req.body.membershipCollected || member.membershipCollected || 0);
    member.membershipDate = req.body.membershipDate
      ? toADDate(req.body.membershipDate) || new Date(req.body.membershipDate)
      : member.membershipDate || null;
    member.notes = normalizeText(req.body.notes || member.notes || "");
    member.status = String(req.body.status || member.status || "active");

    if (member.memberType === "student") {
      member.studentReg = normalizeText(req.body.studentReg || member.studentReg || "");
      member.studentClass = normalizeText(req.body.studentClass || member.studentClass || "");
      member.section = normalizeText(req.body.section || member.section || "");
      member.staffUsername = "";
      member.staffId = "";
    } else {
      member.staffUsername = normalizeText(req.body.staffUsername || member.staffUsername || "");
      member.staffId = normalizeText(req.body.staffId || member.staffId || "");
      member.studentReg = "";
      member.studentClass = "";
      member.section = "";
    }

    await member.save();
    res.status(200).json({ message: "Member updated successfully.", member });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Error updating member.", error });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const member = await Member.findByIdAndDelete(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(200).json({ message: "Member deleted successfully." });
    }

    res.redirect("/library/members");
  } catch (error) {
    console.error("Error deleting member:", error);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ message: "Error deleting member." });
    }
    res.status(500).send("Error deleting member.");
  }
};

exports.listLostBooks = async (req, res) => {
  try {
    const [lostBooks, books, issues, members] = await Promise.all([
      LostBook.find().sort({ createdAt: -1 }).lean(),
      Book.find().sort({ title: 1 }).lean(),
      BookIssue.find({ status: "issued" }).sort({ issuedAt: -1 }).lean(),
      Member.find().sort({ name: 1 }).lean()
    ]);

    res.render("library/lostbook", { lostBooks, books, issues, members, error: "", success: "" });
  } catch (error) {
    console.error("Error listing lost books:", error);
    res.status(500).send("Error loading lost books.");
  }
};

exports.reportLostBook = async (req, res) => {
  try {
    const book = await Book.findById(req.body.bookId);
    if (!book) return res.status(404).json({ message: "Book not found." });

    const bookCode = normalizeText(req.body.bookCode).toUpperCase();
    const copy = (book.bookCodes || []).find((item) => String(item.code).toUpperCase() === bookCode);
    if (!copy) return res.status(400).json({ message: "Book copy code was not found." });
    if (copy.status === "lost") return res.status(400).json({ message: "This copy is already recorded as lost." });

    const duplicate = await LostBook.findOne({ bookId: book._id, bookCode, status: { $nin: ["recovered", "written-off"] } });
    if (duplicate) return res.status(400).json({ message: "This book copy already has an active lost report." });

    const issue = req.body.issueId
      ? await BookIssue.findById(req.body.issueId)
      : await BookIssue.findOne({ status: "issued", bookId: book._id, bookCodes: bookCode });
    const member = req.body.memberId ? await Member.findById(req.body.memberId).lean() : null;
    const lossDateBS = normalizeText(req.body.lossDateBS || "");
    const reportedDateBS = normalizeText(req.body.reportedDateBS || "");
    const reason = normalizeText(req.body.reason || "");
    if (!reason) return res.status(400).json({ message: "A loss reason is required." });
    const lossDate = toADDate(lossDateBS) || new Date();
    const reportedDate = toADDate(reportedDateBS) || new Date();

    const lostBook = await LostBook.create({
      bookId: book._id,
      bookTitle: book.title,
      bookCode,
      isbn: book.isbn || "",
      issueId: issue?._id || null,
      memberId: member?._id || issue?.memberId || null,
      memberName: member?.name || issue?.memberName || "",
      lossDate,
      lossDateBS: lossDateBS || toNepaliDate(lossDate),
      reportedDate,
      reportedDateBS: reportedDateBS || toNepaliDate(reportedDate),
      reason,
      reportedBy: normalizeText(req.body.reportedBy),
      replacementCost: Number(req.body.replacementCost || book.price || 0),
      fineAmount: Number(req.body.fineAmount || 0),
      status: normalizeText(req.body.status) || "reported",
      notes: normalizeText(req.body.notes)
    });

    copy.status = "lost";
    copy.issuedTo = null;
    copy.issuedAt = null;
    copy.issueId = null;
    book.availableQuantity = (book.bookCodes || []).filter((item) => item.status === "available").length;
    await book.save();

    if (issue && issue.status === "issued") {
      issue.status = "lost";
      issue.notes = `${issue.notes || ""}${issue.notes ? " " : ""}Copy ${bookCode} reported lost.`;
      await issue.save();
    }

    res.status(201).json({ message: "Lost book recorded successfully.", lostBook });
  } catch (error) {
    console.error("Error reporting lost book:", error);
    res.status(500).json({ message: "Error recording lost book.", error });
  }
};

exports.updateLostBook = async (req, res) => {
  try {
    const lostBook = await LostBook.findById(req.params.id);
    if (!lostBook) return res.status(404).json({ message: "Lost book record not found." });

    lostBook.status = normalizeText(req.body.status || lostBook.status);
    lostBook.fineAmount = Number(req.body.fineAmount ?? lostBook.fineAmount ?? 0);
    lostBook.notes = normalizeText(req.body.notes ?? lostBook.notes);
    lostBook.recoveryNotes = normalizeText(req.body.recoveryNotes ?? lostBook.recoveryNotes);
    if (lostBook.status === "recovered" && !lostBook.recoveredAt) lostBook.recoveredAt = new Date();
    await lostBook.save();

    if (lostBook.status === "recovered") {
      const book = await Book.findById(lostBook.bookId);
      const copy = book?.bookCodes?.find((item) => String(item.code).toUpperCase() === lostBook.bookCode);
      if (copy) {
        copy.status = "available";
        copy.condition = "good";
        book.availableQuantity = (book.bookCodes || []).filter((item) => item.status === "available").length;
        await book.save();
      }
    }

    res.json({ message: "Lost book record updated successfully.", lostBook });
  } catch (error) {
    console.error("Error updating lost book:", error);
    res.status(500).json({ message: "Error updating lost book.", error });
  }
};
