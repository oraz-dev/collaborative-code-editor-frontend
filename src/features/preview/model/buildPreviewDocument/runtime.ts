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

  // A data: module's URL is its entire percent-encoded source, so any stack
  // frame naming one drowns the actual message. The loader registers the real
  // paths; swap them back in and shorten anything left over.
  window.__spaceModuleNames = window.__spaceModuleNames || {};

  function sanitise(text) {
    var names = window.__spaceModuleNames;
    Object.keys(names).forEach(function (url) {
      text = text.split(url).join(names[url]);
    });
    return text.replace(/data:text\/javascript[^\s)'"]*/g, '<module>');
  }

  window.__spaceSanitise = sanitise;

  // The frame has an opaque origin, so the editor cannot read its DOM to see
  // whether anything was rendered. Only the frame itself can answer that.
  window.__spaceDrew = function () {
    return !!(document.body && document.body.innerHTML.trim().length);
  };

  var renderRaw = render;
  render = function (value, seen) { return sanitise(renderRaw(value, seen)); };
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
    var text = event.error
      ? render(event.error)
      : sanitise(event.message + ' (' + event.lineno + ':' + event.colno + ')');
    post('console', { level: 'error', text: text });
    post('failed', { text: text });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var text = 'Uncaught (in promise) ' + render(event.reason);
    post('console', { level: 'error', text: text });
    post('failed', { text: text });
  });

  // A modal raised in here would freeze the whole tab, editor included, and the
  // sandbox gives no way to dismiss it. They become log lines instead.
  // A page entry runs its own scripts; with no loader to report for it, it
  // says when it has finished settling.
  if (!document.getElementById('__workspace__')) {
    window.addEventListener('load', function () {
      post('ready', { drew: window.__spaceDrew() });
    });
  }

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
  var aliasNode = document.getElementById('__aliases__');
  var aliases = aliasNode ? JSON.parse(aliasNode.textContent) : {};
  var imports = {};

  Object.keys(files).forEach(function (path) {
    // data: rather than blob: — the frame has an opaque origin, where blob URL
    // access is inconsistent between browsers, while a data: module is always
    // loadable by the document that built it.
    imports['workspace:' + path] =
      'data:text/javascript;charset=utf-8,' + encodeURIComponent(files[path]);
  });

  // './util' and './util.ts' both have to reach the module published as
  // util.js — an import map performs no extension fallback of its own.
  Object.keys(aliases).forEach(function (alias) {
    var target = imports['workspace:' + aliases[alias]];
    if (target) imports['workspace:' + alias] = target;
  });

  // Lets the bridge turn a data: URL in a stack back into the file it came from.
  Object.keys(files).forEach(function (path) {
    window.__spaceModuleNames['data:text/javascript;charset=utf-8,'
      + encodeURIComponent(files[path])] = path;
  });

  // npm packages, already resolved to CDN URLs when the document was built.
  var packageNode = document.getElementById('__packages__');
  var packages = packageNode ? JSON.parse(packageNode.textContent) : {};
  Object.keys(packages).forEach(function (specifier) {
    imports[specifier] = packages[specifier];
  });

  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: imports });
  document.head.appendChild(map);

  // A component file that does not mount itself gets its default export
  // rendered into #root. React is resolved through the same map, so it is the
  // one copy the component's own hooks come from.
  function mountDefault(module) {
    if (node.dataset.mount !== 'default') return;
    if (!module || typeof module.default !== 'function') return;
    return Promise.all([import('react'), import('react-dom/client')]).then(function (libs) {
      var root = document.getElementById('root');
      libs[1].createRoot(root).render(libs[0].createElement(module.default));
    });
  }

  import(imports['workspace:' + entry])
    .then(mountDefault)
    .then(function () { window.__spacePost('ready', { drew: window.__spaceDrew() }); })
    .catch(function (error) {
      var text = window.__spaceRender(error);
      window.__spacePost('console', { level: 'error', text: text });
      // Distinct from a logged error: nothing ran at all, so the pane can say so.
      window.__spacePost('failed', { text: text });
      window.__spacePost('ready', { drew: window.__spaceDrew() });
    });
})();
`;
