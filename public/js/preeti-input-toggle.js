(function () {
  const MODE_KEY = "preeti_mode_enabled";
  let isConverting = false;

  function isTextTarget(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;

    if (el.matches("[data-preeti-ignore]")) return false;

    if (el instanceof HTMLInputElement) {
      const type = (el.type || "text").toLowerCase();
      const blocked = [
        "hidden",
        "number",
        "date",
        "time",
        "datetime-local",
        "month",
        "week",
        "email",
        "password",
        "checkbox",
        "radio",
        "file",
        "range",
        "color",
        "url",
        "tel"
      ];
      if (blocked.includes(type)) return false;
      return type === "text" || type === "search";
    }

    return true;
  }

  function convert(value) {
    if (typeof window.preetiToUnicode !== "function") return value;
    try {
      return window.preetiToUnicode(value);
    } catch (err) {
      console.warn("Preeti conversion failed:", err);
      return value;
    }
  }

  function applyConversionToElement(el) {
    if (!window.isNepaliMode || isConverting || !isTextTarget(el)) return;

    const raw = el.value || "";
    if (!raw) return;

    const start = typeof el.selectionStart === "number" ? el.selectionStart : raw.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : raw.length;

    const converted = convert(raw);
    if (converted === raw) return;

    const before = convert(raw.slice(0, start));
    const selected = convert(raw.slice(start, end));

    isConverting = true;
    el.value = converted;

    if (typeof el.setSelectionRange === "function") {
      const newStart = before.length;
      el.setSelectionRange(newStart, newStart + selected.length);
    }
    isConverting = false;
  }

  function insertTextAtCursor(el, text) {
    const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;

    if (typeof el.setRangeText === "function") {
      el.setRangeText(text, start, end, "end");
    } else {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const pos = start + text.length;
      if (typeof el.setSelectionRange === "function") {
        el.setSelectionRange(pos, pos);
      }
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setMode(enabled) {
    window.isNepaliMode = Boolean(enabled);

    try {
      window.localStorage.setItem(MODE_KEY, window.isNepaliMode ? "1" : "0");
    } catch (_) {}

    const checkbox = document.getElementById("nepaliToggle");
    if (checkbox && checkbox.checked !== window.isNepaliMode) {
      checkbox.checked = window.isNepaliMode;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const chip = document.getElementById("mode-chip");
    if (chip) {
      chip.textContent = window.isNepaliMode ? "Nepali mode" : "English mode";
    }

    const button = document.getElementById("language-toggle");
    if (button) {
      button.textContent = window.isNepaliMode ? "Switch to English" : "Switch to Nepali";
    }

    if (typeof window.showSaveStatus === "function") {
      window.showSaveStatus(
        window.isNepaliMode ? "Nepali Typing Enabled (Preeti)" : "English Typing Enabled",
        window.isNepaliMode ? "success" : "info"
      );
    }
  }

  window.toggleLanguage = function (arg) {
    if (typeof arg === "boolean") {
      setMode(arg);
      return;
    }

    if (arg && typeof arg.checked === "boolean") {
      setMode(arg.checked);
      return;
    }

    setMode(!window.isNepaliMode);
  };

  document.addEventListener("input", function (event) {
    applyConversionToElement(event.target);
  }, true);

  document.addEventListener("paste", function (event) {
    const target = event.target;
    if (!window.isNepaliMode || !isTextTarget(target)) return;

    const text = event.clipboardData ? event.clipboardData.getData("text") : "";
    if (!text) return;

    event.preventDefault();
    insertTextAtCursor(target, convert(text));
  }, true);

  document.addEventListener("DOMContentLoaded", function () {
    let initialMode = false;

    try {
      initialMode = window.localStorage.getItem(MODE_KEY) === "1";
    } catch (_) {}

    const existingCheckbox = document.getElementById("nepaliToggle");
    if (existingCheckbox) {
      existingCheckbox.addEventListener("change", function () {
        setMode(existingCheckbox.checked);
      });
      existingCheckbox.checked = initialMode;
    }

    const existingButton = document.getElementById("language-toggle");
    if (existingButton) {
      existingButton.addEventListener("click", function () {
        setMode(!window.isNepaliMode);
      });
    }

    setMode(initialMode);
  });
})();
