export function getReadingTime(content: string) {
  const wordsPerMinute = 200;
  const numberOfWords = content.split(/\s/g).length;
  const minutes = numberOfWords / wordsPerMinute;
  const readTime = Math.ceil(minutes);
  return `${readTime} min read`;
}

export function sortPosts(posts: any[]) {
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function filterDrafts(posts: any[]) {
  return posts.filter((post) => {
    if (import.meta.env.PROD) {
      return !post.data.draft;
    }
    return true;
  });
}
