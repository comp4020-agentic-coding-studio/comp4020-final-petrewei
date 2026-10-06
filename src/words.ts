// The whole vocabulary. Each entry is one magnet, and each magnet exists once:
// if someone has "moon" in their line, nobody else has it. Nobody can type a
// word that isn't here, which is what keeps the door safe to leave open to
// strangers.
export const VOCABULARY: readonly string[] = [
  // people and places
  "I", "you", "we", "they", "my", "your", "our", "stranger", "friend", "nobody",
  "home", "room", "door", "window", "kitchen", "library", "bus", "street", "river", "sea",
  // things
  "moon", "rain", "light", "kettle", "toast", "coffee", "letter", "key", "dog", "cat",
  "dream", "song", "word", "shadow", "garden", "bread", "clock", "map", "storm", "honey",
  // time
  "morning", "night", "Tuesday", "winter", "summer", "today", "tomorrow", "yesterday",
  // doing
  "wait", "run", "sing", "forget", "remember", "hold", "open", "leave", "stay", "find",
  "lose", "keep", "dance", "listen", "whisper", "fall", "grow", "is", "are", "was",
  // describing
  "quiet", "loud", "blue", "small", "slow", "warm", "cold", "lost", "found", "soft",
  "bright", "late", "early", "empty", "full", "strange",
  // small words
  "the", "a", "and", "of", "in", "on", "with", "under", "after", "before",
  "not", "to", "for", "like", "almost", "never", "always", "still", "again", "here",
  // endings, as on a real fridge
  "-s", "-ing", "-ed", "-ly",
];
