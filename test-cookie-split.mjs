import 'dotenv/config';

console.log("Raw Cookie from ENV:", process.env.TWITTER_COOKIES);

const c = process.env.TWITTER_COOKIES || "";
const pools1 = c.split("\n").map(l => l.trim()).filter(l => l.length > 20);
const pools2 = c.split(/\\n|\n/).map(l => l.trim()).filter(l => l.length > 20);

console.log("Pools split by \\n :", pools1.length);
console.log("Pools regex split:", pools2.length);
console.log("Example:", pools2[0].slice(0, 50));
