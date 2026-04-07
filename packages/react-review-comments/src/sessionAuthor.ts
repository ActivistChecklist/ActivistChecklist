import { useState, useEffect } from 'react';

const SESSION_AUTHOR_KEY = 'ac.annotations.author';

function generateAnonymousName(): string {
  const adjectives = ['Calm', 'Bright', 'Steady', 'Quiet', 'Bold', 'Kind', 'Swift', 'Clear'];
  const nouns = ['Pine', 'River', 'Signal', 'Sparrow', 'Maple', 'Harbor', 'Falcon', 'Comet'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adjective}${noun}`;
}

export function useSessionAuthor(): {
  author: string;
  updateAuthor: (nextAuthor: string) => void;
} {
  const [author, setAuthor] = useState('Anonymous');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const existing = window.sessionStorage.getItem(SESSION_AUTHOR_KEY);
    if (existing) {
      setAuthor(existing);
      return;
    }
    const generated = generateAnonymousName();
    window.sessionStorage.setItem(SESSION_AUTHOR_KEY, generated);
    setAuthor(generated);
  }, []);

  const updateAuthor = (nextAuthor: string) => {
    const safeAuthor = (nextAuthor || '').trim().slice(0, 80) || generateAnonymousName();
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_AUTHOR_KEY, safeAuthor);
    }
    setAuthor(safeAuthor);
  };

  return { author, updateAuthor };
}
