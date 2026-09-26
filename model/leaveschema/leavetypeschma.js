const mongoose = require('monoose')
const leaveSchema = new mongoose.Schema(
  {

  name: {type:String,required:true}
  description: {type:String,required:false}
  maxDaysPerYear: {type:Number,required:false}
  requiresDocument: {type:Boolean,required:fasle}
  isPaid: {type:Boolean,required:fasle}
  applicableTo: [{type:String}]
  isActive: true,
  createdAt: ISODate("2026-04-01T00:00:00Z")
}
)