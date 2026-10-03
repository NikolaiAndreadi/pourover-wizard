import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Syntax-aware guard includes optional/computed access and destructuring.
// Bluetooth ambient types and native plugin imports are restricted too.
const restricted =
  /^(bluetooth|Bluetooth.*|BluetoothDevice|BluetoothRemoteGATT.*)$/i;
/** @param {string} directory @returns {Promise<void>} */
async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await checkDirectory(file);
    else if (/\.tsx?$/.test(file) && !file.startsWith("src/scale/transport/")) {
      const source = ts.createSourceFile(
        file,
        (await readFile(file)).toString("utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      /** @param {ts.Node} node */
      const visit = (node) => {
        if (!node.parent) {
          ts.forEachChild(node, visit);
          return;
        }
        const propertyAccess =
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node;
        const computedAccess =
          ts.isElementAccessExpression(node.parent) &&
          node.parent.argumentExpression === node;
        const binding =
          ts.isBindingElement(node.parent) &&
          (node.parent.propertyName === node ||
            (!node.parent.propertyName && node.parent.name === node));
        const typeReference = ts.isTypeReferenceNode(node.parent);
        if (
          (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
          restricted.test(node.text) &&
          (propertyAccess || computedAccess || binding || typeReference)
        ) {
          const { line, character } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          console.error(
            `${file}:${line + 1}:${character + 1}: Bluetooth API access belongs in src/scale/transport/`,
          );
          process.exitCode = 1;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
await checkDirectory("src");
if (!process.exitCode) console.log("Bluetooth boundary passed.");
