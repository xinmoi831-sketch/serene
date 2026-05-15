const Datastore = require("@seald-io/nedb");
const path = require("path");
const fs = require("fs");

// Create data folder if it doesn't exist
const dbPath = path.join(__dirname, "../data");
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const collections = {
  users:    new Datastore({ filename: path.join(dbPath, "users.db"),    autoload: true }),
  messages: new Datastore({ filename: path.join(dbPath, "messages.db"), autoload: true }),
  moods:    new Datastore({ filename: path.join(dbPath, "moods.db"),    autoload: true }),
  journal:  new Datastore({ filename: path.join(dbPath, "journal.db"),  autoload: true }),
  usage:    new Datastore({ filename: path.join(dbPath, "usage.db"),    autoload: true }),
};

collections.users.ensureIndex({ fieldName: "email", unique: true });
collections.messages.ensureIndex({ fieldName: "userId" });
collections.moods.ensureIndex({ fieldName: "userId" });
collections.journal.ensureIndex({ fieldName: "userId" });
collections.usage.ensureIndex({ fieldName: "userId" });

function findOne(col, query) {
  return new Promise((resolve, reject) => {
    col.findOne(query, (err, doc) => { if (err) reject(err); else resolve(doc); });
  });
}

function find(col, query, options = {}) {
  return new Promise((resolve, reject) => {
    let cursor = col.find(query);
    if (options.sort)  cursor = cursor.sort(options.sort);
    if (options.limit) cursor = cursor.limit(options.limit);
    cursor.exec((err, docs) => { if (err) reject(err); else resolve(docs); });
  });
}

function insert(col, doc) {
  return new Promise((resolve, reject) => {
    col.insert(doc, (err, newDoc) => { if (err) reject(err); else resolve(newDoc); });
  });
}

function update(col, query, updateDoc, options = {}) {
  return new Promise((resolve, reject) => {
    col.update(query, { $set: updateDoc }, options, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}

function remove(col, query, options = {}) {
  return new Promise((resolve, reject) => {
    col.remove(query, options, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}

function count(col, query) {
  return new Promise((resolve, reject) => {
    col.count(query, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}

module.exports = { collections, findOne, find, insert, update, remove, count };
