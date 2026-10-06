// Just enough Markdown for README.md: headings, paragraphs, lists, links,
// emphasis and inline code. Rendered on the server so /readme/ is complete in
// the HTML it sends, with no script.
const escape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return escape(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="/$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    para = [];
    list = [];
  };
  let comment = false;
  for (const line of md.split(/\r?\n/)) {
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    if (line.trim().startsWith("<!--")) {
      flush();
      comment = !line.includes("-->");
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flush();
      const n = heading[1].length;
      out.push(`<h${n}>${inline(heading[2])}</h${n}>`);
    } else if (item) {
      if (para.length) flush();
      list.push(item[1]);
    } else if (line.trim() === "") {
      flush();
    } else if (list.length) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n");
}
