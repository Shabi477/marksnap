/**
 * Returns Tailwind classes for difficulty badge styling.
 */
export const difficultyColor = (d) => {
  if (d === 'easy') return 'bg-green-100 text-green-800';
  if (d === 'medium') return 'bg-yellow-100 text-yellow-800';
  if (d === 'hard') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};
