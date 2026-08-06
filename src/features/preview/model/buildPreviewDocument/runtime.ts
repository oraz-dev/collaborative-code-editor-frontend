/**
 * The scripts that run inside the preview frame.
 *
 * Kept as strings rather than modules because they execute in a sandboxed
 * frame with an opaque origin, which cannot fetch anything this app serves —
 * everything it runs has to be inlined in the document itself.
 *
 * Two parts, because an HTML entry needs only the first: a page brings its own
 * scripts, while a bare module entry also needs the loader.
 */

/** Mirrors console output, errors and would-be modals back to the editor. */
export const CONSOLE_BRIDGE = String.raw`
(function () {
  var CHANNEL = '__space_preview__';

  function post(type, payload) {
    try {
      parent.postMessage(Object.assign({ channel: CHANNEL, type: type }, payload), '*');
    } catch (error) {
      // A value that cannot be structured-cloned must not break the run.
    }
  }

  window.__spacePost = post;

  function render(value, seen) {
    seen = seen || new Set();
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    var type = typeof value;
    if (type === 'string') return value;
    if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
    if (type === 'function') return '[Function' + (value.name ? ': ' + value.name : '') + ']';
    if (type === 'symbol') return value.toString();

    if (value instanceof Error) return value.stack || (value.name + ': ' + value.message);
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return '<' + value.tagName.toLowerCase() + '>';
    }

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        return '[' + value.map(function (item) { return render(item, seen); }).join(', ') + ']';
      }
      var parts = Object.keys(value).map(function (key) {
        return key + ': ' + render(value[key], seen);
      });
      return '{ ' + parts.join(', ') + ' }';
    } catch (error) {
      return String(value);
    }
  }

  window.__spaceRender = render;

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      post('console', { level: level, text: args.map(function (a) { return render(a); }).join(' ') });
      if (original) original.apply(console, args);
    };
  });

  window.addEventListener('error', function (event) {
    post('console', {
      level: 'error',
      text: event.error
        ? render(event.error)
        : event.message + ' (' + event.lineno + ':' + event.colno + ')',
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    post('console', { level: 'error', text: 'Uncaught (in promise) ' + render(event.reason) });
  });

  // A modal raised in here would freeze the whole tab, editor included, and the
  // sandbox gives no way to dismiss it. They become log lines instead.
  window.alert = function (m) { post('console', { level: 'info', text: 'alert: ' + render(m) }); };
  window.confirm = function (m) { post('console', { level: 'info', text: 'confirm: ' + render(m) }); return false; };
  window.prompt = function (m) { post('console', { level: 'info', text: 'prompt: ' + render(m) }); return null; };
})();
`;

/**
 * Turns the inlined workspace into blob modules plus an import map, then
 * imports the entry.
 *
 * The map must be in the document before the first module resolves, which is
 * why the entry is pulled in with a dynamic `import()` on the following line
 * rather than through a `<script type="module">` tag.
 */
export const MODULE_LOADER = String.raw`
(function () {
  var node = document.getElementById('__workspace__');
  var files = JSON.parse(node.textContent);
  var entry = node.dataset.entry;
  var imports = {};

  Object.keys(files).forEach(function (path) {
    // data: rather than blob: — the frame has an opaque origin, where blob URL
    // access is inconsistent between browsers, while a data: module is always
    // loadable by the document that built it.
    imports['workspace:' + path] =
      'data:text/javascript;charset=utf-8,' + encodeURIComponent(files[path]);
  });

  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: imports });
  document.head.appendChild(map);

  import(imports['workspace:' + entry])
    .then(function () { window.__spacePost('ready', {}); })
    .catch(function (error) {
      window.__spacePost('console', { level: 'error', text: window.__spaceRender(error) });
      window.__spacePost('ready', {});
    });
})();
`;
