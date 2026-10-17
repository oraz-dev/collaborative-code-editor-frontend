/**
 * The picker's emoji, by category. Curated rather than the full Unicode set so
 * every entry renders on current macOS, Windows and Android; search reaches the
 * keywords for these through emojilib, loaded on demand.
 */
export interface EmojiCategory {
  id: string;
  /** Shown on the category tab. */
  icon: string;
  label: string;
  emojis: readonly string[];
}

const list = (source: string): readonly string[] => source.trim().split(/\s+/);

export const QUICK_REACTIONS: readonly string[] = list('❤️ 😂 👍 🔥 👀 🎉 🙏');

/** Seeds "Recently used" before the viewer has picked anything. */
export const DEFAULT_RECENT_EMOJIS: readonly string[] = list('👍 🔥 😄 🙏 👀 ✅ 🎉 ❤️ 😂 🚀');

export const RECENT_EMOJI_LIMIT = 24;

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'smileys',
    icon: '😀',
    label: 'Smileys & emotion',
    emojis: list('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊'),
  },
  {
    id: 'people',
    icon: '👋',
    label: 'People & gestures',
    emojis: list('👋 🤚 🖐️ ✋ 🖖 🫱 🫲 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🧠 🫀 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 🧑‍💻 👩‍💻 👨‍💻 🧑‍🔬 🧑‍🎨 🧑‍🚀 🧑‍🍳 🧑‍🏫 🥷 🦸 🦹 🧙 🧛 🧟 💃 🕺 🏃 🚶 🧘 🫂 👥'),
  },
  {
    id: 'nature',
    icon: '🐶',
    label: 'Animals & nature',
    emojis: list('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪲 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🦒 🦘 🐄 🐎 🐖 🐑 🦙 🐐 🦌 🐕 🐩 🐈 🐈‍⬛ 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦦 🦥 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 🌎 🪐 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ ⛅ 🌧️ ⛈️ ❄️ ☃️ ⛄ 🌊 💧'),
  },
  {
    id: 'food',
    icon: '🍕',
    label: 'Food & drink',
    emojis: list('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 🫖 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️'),
  },
  {
    id: 'activity',
    icon: '⚽',
    label: 'Activities',
    emojis: list('⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧗 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🎰 🧩 🎉 🎊 🎈 🎁 🎀 🪅'),
  },
  {
    id: 'travel',
    icon: '🚗',
    label: 'Travel & places',
    emojis: list('🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🚨 🚍 🚘 🚖 🚡 🚠 🚃 🚋 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🚧 ⛽ 🚏 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏥 🏦 🏨 🏪 🏫 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁'),
  },
  {
    id: 'objects',
    icon: '💡',
    label: 'Objects',
    emojis: list('⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 🧮 🎥 📷 📸 📹 📼 🔍 🔎 🕯️ 💡 🔦 🏮 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️ 💰 🪙 💵 💶 💷 💸 💳 🧾 ✉️ 📧 📨 📩 📤 📥 📦 📫 📮 ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🔑 🗝️ 🔨 🪓 ⛏️ ⚒️ 🛠️ 🗡️ ⚔️ 🛡️ 🔧 🪛 🔩 ⚙️ 🗜️ ⚖️ 🔗 ⛓️ 🧰 🧲 🧪 🧫 🧬 🔬 🔭 📡 💉 💊 🩹 🚪 🛏️ 🛋️ 🪑 🚽 🚿 🛁 🧴 🧷 🧹 🧺 🧻 🧼 🧽 🛒 🔮 🧿 🪄 ⏰ ⏱️ ⏳ ⌛ 🔋 🔌'),
  },
  {
    id: 'symbols',
    icon: '❤️',
    label: 'Symbols',
    emojis: list('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⚛️ ☢️ ☣️ 🆚 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 💹 ❇️ ✳️ ❎ 🌐 💠 🌀 💤 ♿ 🅿️ 🚻 📶 ℹ️ 🔤 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 #️⃣ *️⃣ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ 🔄 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 ™️ ©️ ®️ 〰️ ➰ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄'),
  },
  {
    id: 'flags',
    icon: '🏁',
    label: 'Flags',
    emojis: list('🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏴‍☠️ 🇹🇲 🇹🇷 🇺🇿 🇰🇿 🇦🇿 🇰🇬 🇹🇯 🇷🇺 🇺🇦 🇮🇷 🇦🇫 🇨🇳 🇯🇵 🇰🇷 🇮🇳 🇵🇰 🇦🇪 🇸🇦 🇶🇦 🇪🇬 🇺🇸 🇨🇦 🇲🇽 🇧🇷 🇦🇷 🇬🇧 🇮🇪 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇵🇱 🇨🇿 🇸🇪 🇳🇴 🇫🇮 🇩🇰 🇬🇷 🇬🇪 🇦🇲 🇲🇳 🇮🇩 🇲🇾 🇸🇬 🇹🇭 🇻🇳 🇵🇭 🇦🇺 🇳🇿 🇿🇦 🇳🇬 🇰🇪 🇪🇺 🇺🇳'),
  },
  {
    id: 'dev',
    icon: '🐛',
    label: 'Dev & code',
    emojis: list('💻 🖥️ ⌨️ 🖱️ 🧑‍💻 🐛 🪲 🐞 🔧 🛠️ ⚙️ 🧪 🧩 📦 🚀 🔥 ✅ ❌ ⚠️ 🚧 🔒 🔑 🔗 📝 📌 📎 🗂️ 📁 🧠 💡 🤖 👾 🐙 🐍 ☕ 🦀 🐹 🐘 💎 🍃 ⚛️ 🌐 📡 🧵 ⏳ 🔁 🔀 🏗️ 🧹 🗑️ 💥 🩹 🎯 📈 📉 🔍 👀 🫡 🙏 🤝 🍕'),
  },
];
