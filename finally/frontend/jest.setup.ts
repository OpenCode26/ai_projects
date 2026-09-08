import "@testing-library/jest-dom";

// jsdom doesn't implement scrollTo — ChatPanel calls it for auto-scroll on
// new messages, which is incidental to what these tests actually assert.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
