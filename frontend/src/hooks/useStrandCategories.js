import { useMemo } from 'react';

/**
 * Shared hook for parsing strand/category/area hierarchy from topics.
 * Used by AdminPanel and QuestionBank.
 *
 * @param {Array} topics - Array of topic objects with .strand
 * @param {string} selectedStrand - Currently selected strand/category
 * @returns {{ allStrands, hasCategories, strandOptions, getAreas }}
 */
export default function useStrandCategories(topics, selectedStrand) {
  const allStrands = useMemo(() => {
    const s = new Set();
    topics.forEach(t => { if (t.strand) s.add(t.strand); });
    return [...s].sort();
  }, [topics]);

  const hasCategories = useMemo(() => allStrands.some(s => s.includes(':')), [allStrands]);

  const categories = useMemo(() => {
    if (!hasCategories) return [];
    const cats = new Set();
    allStrands.forEach(s => { const [cat] = s.split(':'); cats.add(cat.trim()); });
    return [...cats].sort();
  }, [allStrands, hasCategories]);

  const strandOptions = useMemo(() => {
    return hasCategories ? categories : allStrands;
  }, [hasCategories, categories, allStrands]);

  const getAreas = useMemo(() => {
    if (!hasCategories || !selectedStrand) return [];
    const areas = new Set();
    allStrands.filter(s => s.startsWith(selectedStrand + ':')).forEach(s => {
      const area = s.split(':').slice(1).join(':').trim();
      if (area) areas.add(area);
    });
    return [...areas].sort();
  }, [hasCategories, selectedStrand, allStrands]);

  return { allStrands, hasCategories, strandOptions, areaOptions: getAreas };
}
