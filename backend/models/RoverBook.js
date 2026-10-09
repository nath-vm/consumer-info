const mongoose = require('mongoose');

const RoverBookSchema = new mongoose.Schema({
  roverNumber: { type: String, required: true, trim: true, unique: true },
  address:     { type: String, required: true, trim: true },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('RoverBook', RoverBookSchema);