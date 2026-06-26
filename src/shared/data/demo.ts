export interface Collaborator {
  id: string;
  name: string;
  short: string;
  presence: string;
  you?: boolean;
}

export const COLLABORATORS: Collaborator[] = [
  { id: 'you',   name: 'You',           short: 'You',   presence: 'var(--presence-1)', you: true },
  { id: 'ada',   name: 'Ada Lovelace',  short: 'Ada',   presence: 'var(--presence-2)' },
  { id: 'linus', name: 'Linus Berg',    short: 'Linus', presence: 'var(--presence-3)' },
  { id: 'mira',  name: 'Mira Okonkwo',  short: 'Mira',  presence: 'var(--presence-4)' },
];

export const byId = (id: string) => COLLABORATORS.find((c) => c.id === id)!;

export const LANG_COLOR: Record<string, string> = {
  tsx: '#4d9eff', ts: '#3b9eff', css: '#9d7cff', md: '#828ca2', json: '#e7ab43', js: '#e7ab43',
};
export const LANG_LABEL: Record<string, string> = {
  tsx: 'TypeScript React', ts: 'TypeScript', css: 'CSS', md: 'Markdown', json: 'JSON', js: 'JavaScript',
};

export type CodeSegment = [string, string];

export interface FileData {
  path: string[];
  name: string;
  lang: string;
  editedBy: string;
  editedAt: string;
  lines: CodeSegment[][];
}

export const FILES: Record<string, FileData> = {
  'editor.tsx': {
    path: ['src'], name: 'editor.tsx', lang: 'tsx', editedBy: 'ada', editedAt: '2 min ago',
    lines: [
      [['c', '// The shared editor surface — everyone edits the same doc']],
      [['k', 'import'], ['p', ' { '], ['v', 'useState'], ['p', ', '], ['v', 'useEffect'], ['p', ' } '], ['k', 'from'], ['s', " 'react'"]],
      [['k', 'import'], ['p', ' { '], ['v', 'join'], ['p', ', '], ['v', 'cursors'], ['p', ' } '], ['k', 'from'], ['s', " './collab/presence'"]],
      [],
      [['k', 'export function'], ['f', ' Editor'], ['p', '({ '], ['v', 'doc'], ['p', ' }: '], ['t', 'Props'], ['p', ') {']],
      [['p', '  '], ['k', 'const'], ['p', ' ['], ['v', 'peers'], ['p', ', '], ['v', 'setPeers'], ['p', '] = '], ['f', 'useState'], ['p', '<'], ['t', 'Peer'], ['p', '[]>([])']],
      [],
      [['p', '  '], ['f', 'useEffect'], ['p', '(() => '], ['f', 'join'], ['p', '('], ['v', 'doc'], ['p', '.'], ['v', 'id'], ['p', ', '], ['v', 'setPeers'], ['p', '), ['], ['v', 'doc'], ['p', '.'], ['v', 'id'], ['p', '])']],
      [],
      [['p', '  '], ['k', 'return'], ['p', ' (']],
      [['p', '    <'], ['t', 'Surface'], ['p', ' '], ['v', 'doc'], ['p', '={'], ['v', 'doc'], ['p', '}>']],
      [['p', '      <'], ['t', 'Cursors'], ['p', ' '], ['v', 'of'], ['p', '={'], ['f', 'cursors'], ['p', '('], ['v', 'peers'], ['p', ')} />']],
      [['p', '      <'], ['t', 'Gutter'], ['p', ' '], ['v', 'lines'], ['p', '={'], ['v', 'doc'], ['p', '.'], ['v', 'length'], ['p', '} />']],
      [['p', '    </'], ['t', 'Surface'], ['p', '>']],
      [['p', '  )']],
      [['p', '}']],
    ],
  },
  'presence.ts': {
    path: ['src', 'collab'], name: 'presence.ts', lang: 'ts', editedBy: 'mira', editedAt: '5 min ago',
    lines: [
      [['c', '// Realtime presence — who is here, and where']],
      [['k', 'import'], ['p', ' { '], ['v', 'channel'], ['p', ' } '], ['k', 'from'], ['s', " '../net'"]],
      [],
      [['k', 'export type'], ['t', ' Peer'], ['p', ' = {']],
      [['p', '  '], ['v', 'id'], ['p', ': '], ['t', 'string'], ['p', '; '], ['v', 'color'], ['p', ': '], ['t', 'string'], ['p', '; '], ['v', 'line'], ['p', ': '], ['t', 'number']],
      [['p', '}']],
      [],
      [['k', 'export function'], ['f', ' join'], ['p', '('], ['v', 'id'], ['p', ': '], ['t', 'string'], ['p', ', '], ['v', 'on'], ['p', ': ('], ['v', 'p'], ['p', ': '], ['t', 'Peer'], ['p', '[]) => '], ['t', 'void'], ['p', ') {']],
      [['p', '  '], ['v', 'channel'], ['p', '.'], ['f', 'open'], ['p', '('], ['v', 'id'], ['p', ').'], ['f', 'on'], ['p', '('], ['s', "'presence'"], ['p', ', '], ['v', 'on'], ['p', ')']],
      [['p', '  '], ['k', 'return'], ['p', ' () => '], ['v', 'channel'], ['p', '.'], ['f', 'close'], ['p', '('], ['v', 'id'], ['p', ')']],
      [['p', '}']],
    ],
  },
  'cursor.ts': {
    path: ['src', 'collab'], name: 'cursor.ts', lang: 'ts', editedBy: 'linus', editedAt: '1 hr ago',
    lines: [
      [['c', '// Cursor + selection sync']],
      [['k', 'export function'], ['f', ' broadcast'], ['p', '('], ['v', 'pos'], ['p', ': '], ['t', 'number'], ['p', ') {']],
      [['p', '  '], ['k', 'return'], ['p', ' { '], ['v', 'pos'], ['p', ', '], ['v', 'at'], ['p', ': '], ['t', 'Date'], ['p', '.'], ['f', 'now'], ['p', '() }']],
      [['p', '}']],
    ],
  },
  'app.tsx': {
    path: ['src'], name: 'app.tsx', lang: 'tsx', editedBy: 'you', editedAt: 'yesterday',
    lines: [
      [['k', 'import'], ['p', ' { '], ['v', 'Editor'], ['p', ' } '], ['k', 'from'], ['s', " './editor'"]],
      [],
      [['k', 'export default function'], ['f', ' App'], ['p', '() {']],
      [['p', '  '], ['k', 'return'], ['p', ' <'], ['t', 'Editor'], ['p', ' '], ['v', 'doc'], ['p', '={'], ['v', 'doc'], ['p', '} />']],
      [['p', '}']],
    ],
  },
  'styles.css': {
    path: ['src'], name: 'styles.css', lang: 'css', editedBy: 'you', editedAt: '3 days ago',
    lines: [
      [['c', '/* calm, dark-first */']],
      [['t', ':root'], ['p', ' {']],
      [['p', '  --accent: '], ['n', '#4d9eff'], ['p', ';']],
      [['p', '  --bg: '], ['n', '#0b0d12'], ['p', ';']],
      [['p', '}']],
    ],
  },
  'README.md': {
    path: [], name: 'README.md', lang: 'md', editedBy: 'you', editedAt: 'last week',
    lines: [ [['k', '# Space']], [], [['p', 'A calm place to build, together.']] ],
  },
  'package.json': {
    path: [], name: 'package.json', lang: 'json', editedBy: 'you', editedAt: 'last week',
    lines: [ [['p', '{']], [['p', '  '], ['s', '"name"'], ['p', ': '], ['s', '"space"']], [['p', '}']] ],
  },
};

export interface LiveCursor {
  who: string;
  line: number;
  col: number;
  variant?: string;
}

export const LIVE_CURSORS: Record<string, LiveCursor[]> = {
  'editor.tsx': [
    { who: 'ada',   line: 6,  col: 30, variant: 'caret' },
    { who: 'linus', line: 11, col: 30, variant: 'pointer' },
  ],
  'presence.ts': [
    { who: 'mira', line: 9, col: 24, variant: 'caret' },
  ],
};

export interface Comment {
  id: string;
  who: string;
  line: number;
  time: string;
  body: string;
}

export const COMMENTS: Record<string, Comment[]> = {
  'editor.tsx': [
    { id: 'c1', who: 'ada',   line: 6,  time: '2m', body: 'Should peers live in context so the gutter + status bar can both read it?' },
    { id: 'c2', who: 'linus', line: 11, time: 'now', body: 'Good call — lifting it now. Watch my cursor.' },
  ],
  'presence.ts': [
    { id: 'c3', who: 'mira', line: 8, time: '5m', body: 'Returning the unsubscribe here keeps join() tidy.' },
  ],
};

export const SEARCH = {
  query: 'peers',
  replace: '',
  files: [
    { id: 'editor.tsx', path: 'src', lang: 'tsx', matches: [
      { line: 6,  before: '  const [', match: 'peers', after: ', setPeers] = useState<Peer[]>([])' },
      { line: 8,  before: '  useEffect(() => join(doc.id, setP', match: 'eers', after: '), [doc.id])' },
      { line: 11, before: '      <Cursors of={cursors(', match: 'peers', after: ')} />' },
    ]},
    { id: 'presence.ts', path: 'src/collab', lang: 'ts', matches: [
      { line: 8, before: 'export function join(id: string, on: (', match: 'peers', after: ': Peer[]) => void) {' },
    ]},
    { id: 'app.tsx', path: 'src', lang: 'tsx', matches: [
      { line: 4, before: '  return <Editor doc={doc} ', match: 'peers', after: '={live} />' },
    ]},
    { id: 'README.md', path: '', lang: 'md', matches: [
      { line: 3, before: 'Edit together — every cursor and ', match: 'peer', after: ' stays in sync.' },
    ]},
  ],
};

export const GIT_STATUS = {
  branch: 'main',
  ahead: 2,
  behind: 0,
  staged: [
    { path: 'src/editor.tsx', status: 'M', add: 14, del: 3 },
    { path: 'src/collab/presence.ts', status: 'M', add: 6, del: 1 },
  ],
  changed: [
    { path: 'src/collab/cursor.ts', status: 'M', add: 8, del: 0 },
    { path: 'src/styles.css', status: 'M', add: 2, del: 2 },
    { path: 'src/hooks/useShare.ts', status: 'A', add: 31, del: 0 },
  ],
};

export const GIT_LANE_COLOR = ['var(--presence-1)', 'var(--presence-2)', 'var(--presence-3)', 'var(--presence-4)'];

export interface CommitData {
  hash: string;
  lane: number;
  parents: number[];
  who: string;
  time: string;
  msg: string;
  merge?: boolean;
  refs: { type: string; name: string }[];
}

export const COMMITS: CommitData[] = [
  { hash: 'a1f9c2e', lane: 0, parents: [1], who: 'ada',   time: '2 min ago', msg: 'Lift peers into shared context', refs: [{ type: 'head', name: 'main' }, { type: 'remote', name: 'origin/main' }] },
  { hash: '7b3d018', lane: 0, parents: [2, 3], who: 'you', time: '18 min ago', msg: "Merge branch 'cursor-sync'", merge: true, refs: [] },
  { hash: 'c4e7a90', lane: 0, parents: [6], who: 'you',   time: '1 hr ago',  msg: 'Polish the floating status capsule', refs: [] },
  { hash: '9d2b5f1', lane: 1, parents: [4], who: 'linus', time: '2 hr ago',  msg: 'cursor-sync: broadcast selection range', refs: [{ type: 'branch', name: 'cursor-sync' }] },
  { hash: 'e0a83c6', lane: 1, parents: [6], who: 'linus', time: '3 hr ago',  msg: 'cursor-sync: throttle cursor updates', refs: [] },
  { hash: 'f51c7d4', lane: 2, parents: [6], who: 'mira',  time: '4 hr ago',  msg: 'wip: experiment with cursor easing', refs: [{ type: 'branch', name: 'mira/scratch' }] },
  { hash: '3c9e1a7', lane: 0, parents: [7], who: 'ada',   time: '5 hr ago',  msg: 'Add presence join / leave channel', refs: [] },
  { hash: '8a40b2d', lane: 0, parents: [],  who: 'you',   time: 'yesterday', msg: 'Initial editor surface', refs: [{ type: 'tag', name: 'v0.1' }] },
];

export const COMMIT_FILES: Record<string, { path: string; status: string; add: number; del: number }[]> = {
  a1f9c2e: [
    { path: 'src/editor.tsx', status: 'M', add: 14, del: 3 },
    { path: 'src/collab/presence.ts', status: 'M', add: 6, del: 1 },
  ],
  '7b3d018': [
    { path: 'src/collab/cursor.ts', status: 'M', add: 22, del: 4 },
    { path: 'src/editor.tsx', status: 'M', add: 9, del: 2 },
  ],
  c4e7a90: [{ path: 'src/chrome/status.tsx', status: 'M', add: 11, del: 7 }],
  '9d2b5f1': [{ path: 'src/collab/cursor.ts', status: 'M', add: 18, del: 1 }],
  e0a83c6: [{ path: 'src/collab/cursor.ts', status: 'M', add: 7, del: 0 }],
  f51c7d4: [{ path: 'src/collab/ease.ts', status: 'A', add: 24, del: 0 }],
  '3c9e1a7': [{ path: 'src/collab/presence.ts', status: 'A', add: 40, del: 0 }],
  '8a40b2d': [
    { path: 'src/editor.tsx', status: 'A', add: 86, del: 0 },
    { path: 'src/app.tsx', status: 'A', add: 12, del: 0 },
  ],
};

export interface OutlineSymbol {
  kind: string;
  name: string;
  line: number;
}

export const OUTLINE: Record<string, OutlineSymbol[]> = {
  'editor.tsx': [
    { kind: 'import', name: "react, ./collab/presence", line: 2 },
    { kind: 'function', name: 'Editor', line: 5 },
    { kind: 'const', name: 'peers', line: 6 },
    { kind: 'effect', name: 'join(doc.id)', line: 8 },
    { kind: 'return', name: '<Surface>', line: 10 },
  ],
  'presence.ts': [
    { kind: 'import', name: 'channel', line: 2 },
    { kind: 'type', name: 'Peer', line: 4 },
    { kind: 'function', name: 'join', line: 8 },
  ],
  'cursor.ts': [
    { kind: 'function', name: 'broadcast', line: 2 },
  ],
  'app.tsx': [
    { kind: 'import', name: 'Editor', line: 1 },
    { kind: 'function', name: 'App', line: 3 },
  ],
  'styles.css': [
    { kind: 'rule', name: ':root', line: 2 },
  ],
};

export interface Project {
  id: string;
  name: string;
  desc: string;
  langs: string[];
  stars: number;
  pinned?: boolean;
  branch: string;
  updated: string;
  here: string[];
  commits: number;
}

export const PROJECTS: Project[] = [
  { id: 'space-editor', name: 'space-editor', desc: 'The realtime collaborative editor surface.', langs: ['tsx', 'ts', 'css'], stars: 1, pinned: true, branch: 'main', updated: '2 min ago', here: ['ada', 'linus', 'mira'], commits: 248 },
  { id: 'presence-core', name: 'presence-core', desc: 'CRDT presence + cursor sync engine.', langs: ['ts'], stars: 1, branch: 'main', updated: '1 hr ago', here: ['linus'], commits: 132 },
  { id: 'space-web', name: 'space-web', desc: 'Marketing site and docs.', langs: ['tsx', 'css', 'md'], stars: 0, branch: 'main', updated: 'yesterday', here: [], commits: 87 },
  { id: 'space-cli', name: 'space-cli', desc: 'Open a Space from your terminal.', langs: ['ts', 'js'], stars: 0, branch: 'main', updated: '3 days ago', here: [], commits: 41 },
  { id: 'design-tokens', name: 'design-tokens', desc: 'Source of truth for color, type, spacing.', langs: ['css', 'json'], stars: 1, branch: 'main', updated: '5 days ago', here: ['mira'], commits: 63 },
  { id: 'space-api', name: 'space-api', desc: 'Realtime gateway + auth service.', langs: ['ts'], stars: 0, branch: 'main', updated: '1 week ago', here: [], commits: 204 },
];

export const LIVE_SESSIONS = [
  { project: 'space-editor', file: 'editor.tsx', people: ['ada', 'linus', 'mira'], started: '12 min' },
  { project: 'design-tokens', file: 'colors.css', people: ['mira'], started: '4 min' },
];

export const ACTIVITY = [
  { who: 'ada', action: 'pushed 3 commits to', target: 'space-editor', meta: 'main', time: '2m' },
  { who: 'linus', action: 'opened a pull request in', target: 'presence-core', meta: '#48 throttle updates', time: '26m' },
  { who: 'mira', action: 'commented on', target: 'space-editor', meta: 'presence.ts L8', time: '1h' },
  { who: 'you', action: 'merged', target: 'space-editor', meta: "branch 'cursor-sync'", time: '3h' },
  { who: 'ada', action: 'created', target: 'design-tokens', meta: 'v0.3 tag', time: 'yesterday' },
];

export const MEMBERS = [
  { id: 'you', role: 'Owner', email: 'you@studio.com', last: 'now' },
  { id: 'ada', role: 'Admin', email: 'ada@studio.com', last: '2 min ago' },
  { id: 'linus', role: 'Member', email: 'linus@studio.com', last: '26 min ago' },
  { id: 'mira', role: 'Member', email: 'mira@studio.com', last: '1 hr ago' },
];

export const PENDING_INVITES = [
  { email: 'grace@studio.com', role: 'Member', sent: '2 days ago' },
];

export const ACCOUNT = {
  name: 'You', email: 'you@studio.com', handle: '@you', plan: 'Team', presence: 'var(--presence-1)',
  workspace: { name: 'Studio', slug: 'studio', members: 4, visibility: 'Private' },
  bio: 'Building calm tools for people who write code together. Mostly TypeScript, occasionally Rust.',
  location: 'Lisbon, PT', joined: 'March 2024', role: 'Owner',
  stats: { projects: 6, commits: 1284, reviews: 92, streak: 18 },
};

export const RUN_OUTPUT = [
  { t: 'cmd', text: '$ space run' },
  { t: 'dim', text: 'space-editor · node 20.11 · main' },
  { t: 'info', text: 'Installing dependencies…' },
  { t: 'ok', text: '✓ 312 packages up to date' },
  { t: 'info', text: 'Compiling editor.tsx + 41 modules…' },
  { t: 'ok', text: '✓ Build succeeded in 412ms' },
  { t: 'blank', text: '' },
  { t: 'ready', text: '➞  Local:    http://localhost:3000' },
  { t: 'ready', text: '➞  Network:  http://10.0.0.4:3000' },
  { t: 'blank', text: '' },
  { t: 'dim', text: 'watching for changes — press q to quit' },
];

export const NOTIFICATIONS = [
  { who: 'ada', icon: 'GitCommit', text: 'pushed 3 commits to', target: 'space-editor', time: '2m', unread: true },
  { who: 'linus', icon: 'Comment', text: 'replied to your comment in', target: 'presence.ts', time: '26m', unread: true },
  { who: 'mira', icon: 'GitPull', text: 'requested your review on', target: '#48 throttle updates', time: '1h', unread: true },
  { who: 'ada', icon: 'Share', text: 'invited you to', target: 'design-tokens', time: '3h', unread: false },
  { who: 'linus', icon: 'Star', text: 'starred', target: 'space-cli', time: 'yesterday', unread: false },
];

export const PLANS = [
  { id: 'free', name: 'Free', price: '$0', cadence: 'forever', tagline: 'For solo work and small experiments.',
    features: ['Up to 3 projects', '2 collaborators per session', '7-day history', 'Community support'], cta: 'Current plan', current: false },
  { id: 'team', name: 'Team', price: '$12', cadence: 'per editor / mo', tagline: 'For teams building together, live.',
    features: ['Unlimited projects', 'Unlimited collaborators', 'Full history & branches', 'Comments & reviews', 'Priority support'], cta: 'Current plan', current: true, featured: true },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', cadence: 'contact us', tagline: 'For organizations that need control.',
    features: ['SSO & SCIM', 'Audit logs', 'Self-host option', 'Dedicated support', '99.99% uptime SLA'], cta: 'Contact sales', current: false },
];
