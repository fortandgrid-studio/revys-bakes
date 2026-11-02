import { access } from "node:fs/promises";

const files = ["index.html", "styles.css", "app.js", "owner.html", "owner.js", "functions/api/orders.js"];
for (const file of files) await access(file);
console.log(`Static build validation passed for ${files.length} files.`);
