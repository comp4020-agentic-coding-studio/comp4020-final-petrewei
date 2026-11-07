/** @param {string} id @param {Document} root */
export function element(id, root = document) {
  const node = root.getElementById(id);
  if (!node) throw new Error(`Missing page element: ${id}`);
  return node;
}
/** @param {string} id */
export function button(id) {
  const node = element(id);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Expected button: ${id}`);
  return node;
}
/** @param {string} id */
export function input(id) {
  const node = element(id);
  if (!(node instanceof HTMLInputElement)) throw new Error(`Expected input: ${id}`);
  return node;
}
