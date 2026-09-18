// Minimal DOM fixture for view tests. No browser, production data or network required.
export class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.events = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = {
      toggle: (name, force) => {
        const classes = new Set(String(this.attrs.class || '').split(' ').filter(Boolean));
        const add = force ?? !classes.has(name);
        if (add) classes.add(name); else classes.delete(name);
        this.attrs.class = [...classes].join(' ');
      },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false),
    };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) this.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'text') this.textContent = value;
      else this.setAttribute(key, value);
    }
    this.append(...children);
  }
  setAttribute(key, value) {
    this.attrs[key] = value;
    if (['value', 'hidden', 'disabled'].includes(key)) this[key] = value;
  }
  append(...nodes) {
    for (const node of nodes.flat(Infinity)) {
      if (node === null || node === undefined || node === false) continue;
      if (node instanceof Element) { node.remove(); node.parent = this; }
      this.children.push(node);
    }
  }
  prepend(node) { node.remove(); node.parent = this; this.children.unshift(node); }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
    this.parent = null;
  }
  cloneNode(deep = false) {
    const copy = new Element(this.tag, this.attrs);
    if (deep) copy.append(...this.children.map((node) => node instanceof Element ? node.cloneNode(true) : node));
    return copy;
  }
  replaceWith(node) {
    if (!this.parent) return;
    const parent = this.parent, index = parent.children.indexOf(this);
    node.remove();
    parent.children[index] = node;
    node.parent = parent;
    this.parent = null;
  }
  get textContent() { return this.children.map((n) => n instanceof Element ? n.textContent : String(n)).join(' '); }
  set textContent(value) { clear(this); this.children = [value]; }
  get childElementCount() { return this.children.filter((n) => n instanceof Element).length; }
  querySelectorAll(selector) {
    const attribute = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
    const matches = (node) => attribute ? String(node.attrs[attribute[1]]) === attribute[2]
      : selector.startsWith('.') ? String(node.attrs.class || '').split(' ').includes(selector.slice(1))
        : selector.startsWith('#') ? node.attrs.id === selector.slice(1) : node.tag === selector;
    return this.children.filter((n) => n instanceof Element).flatMap((n) => [
      ...(matches(n) ? [n] : []),
      ...n.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  addEventListener(event, fn) { (this.events[event] ??= []).push(fn); }
  async fire(event, data = {}) { for (const fn of this.events[event] || []) await fn(data); }
  click() { return this.disabled ? Promise.resolve() : this.fire('click'); }
}
export const el = (tag, attrs, ...children) => new Element(tag, attrs, children);
export function clear(node) {
  for (const child of [...node.children]) if (child instanceof Element) child.remove();
  node.children = [];
  return node;
}
export const button = (root, text) => root.querySelectorAll('button').find((b) => b.textContent.includes(text));
