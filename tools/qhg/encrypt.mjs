import { createCipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
const [, , plainPath, keyPath] = process.argv;
const key = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "hex");
const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", key, iv);
const data = Buffer.concat([c.update(fs.readFileSync(plainPath)), c.final()]);
process.stdout.write(JSON.stringify({ iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") }));
