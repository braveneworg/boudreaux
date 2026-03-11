// Fix releases that were "published" with the wrong field name (publishedOn instead of publishedAt)
// and/or accidentally soft-deleted

// In MongoDB shell:
// 1. Clear accidental soft-deletes on releases that should be active:
db.Release.updateMany(
  { deletedOn: { $ne: null }, publishedAt: { $ne: null } },
  { $set: { deletedOn: null } }
);

// 2. If releases have publishedOn but not publishedAt, copy the value:
db.Release.find({ publishedOn: { $ne: null }, publishedAt: null }).forEach(function (doc) {
  db.Release.updateOne({ _id: doc._id }, { $set: { publishedAt: doc.publishedOn } });
});
