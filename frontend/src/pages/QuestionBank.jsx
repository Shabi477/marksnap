import { useState, useEffect } from 'react';
import { questionsAPI, topicsAPI, subjectsAPI } from '../services/api';

export default function QuestionBank() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ difficulty: '', key_stage: '', search: '' });
  const [expandedQ, setExpandedQ] = useState(null);

  useEffect(() => {
    subjectsAPI.list().then(r => setSubjects(r.data));
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      topicsAPI.list(selectedSubject).then(r => setTopics(r.data));
      setSelectedTopic(null);
    } else {
      setTopics([]);
    }
  }, [selectedSubject]);

  useEffect(() => {
    fetchQuestions();
  }, [selectedSubject, selectedTopic, filters.difficulty, filters.key_stage]);

  const fetchQuestions = async () => {
    if (!selectedSubject) { setQuestions([]); return; }
    setLoading(true);
    try {
      const params = { subject_id: selectedSubject };
      if (selectedTopic) params.topic_id = selectedTopic;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.key_stage) params.key_stage = filters.key_stage;
      if (filters.search) params.search = filters.search;
      const r = await questionsAPI.list(params);
      setQuestions(r.data);
    } catch (err) {
      console.error('Failed to load questions', err);
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchQuestions();
  };

  const difficultyColor = (d) => {
    if (d === 'easy') return 'bg-green-100 text-green-800';
    if (d === 'medium') return 'bg-yellow-100 text-yellow-800';
    if (d === 'hard') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const answerLabel = (q, letter) => {
    const key = `option_${letter.toLowerCase()}`;
    return q[key];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <span className="text-sm text-gray-500">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Subject */}
          <select
            value={selectedSubject || ''}
            onChange={e => setSelectedSubject(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-gray-300 text-sm"
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Topic */}
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-gray-300 text-sm"
            disabled={!selectedSubject}
          >
            <option value="">All Topics</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.question_count})</option>
            ))}
          </select>

          {/* Difficulty */}
          <select
            value={filters.difficulty}
            onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}
            className="rounded-lg border-gray-300 text-sm"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Key Stage */}
          <select
            value={filters.key_stage}
            onChange={e => setFilters(f => ({ ...f, key_stage: e.target.value }))}
            className="rounded-lg border-gray-300 text-sm"
          >
            <option value="">All Key Stages</option>
            <option value="KS3">KS3</option>
            <option value="KS4">KS4</option>
            <option value="KS5">KS5</option>
          </select>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search questions..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="flex-1 rounded-lg border-gray-300 text-sm"
            />
            <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Questions */}
      {!selectedSubject ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Select a subject to browse questions</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No questions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                      {q.topic_name && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">
                          {q.topic_name}
                        </span>
                      )}
                      {q.year_group && (
                        <span className="text-xs text-gray-500">{q.year_group}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900">{q.question_text}</p>
                  </div>
                  <span className="text-gray-400 ml-2">{expandedQ === q.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expandedQ === q.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {['A', 'B', 'C', 'D', 'E'].map(letter => {
                      const text = answerLabel(q, letter);
                      if (!text) return null;
                      const isCorrect = q.correct_answer === letter;
                      return (
                        <div
                          key={letter}
                          className={`p-2 rounded-lg text-sm border ${
                            isCorrect
                              ? 'bg-green-50 border-green-300 text-green-800 font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <span className="font-medium mr-2">{letter})</span>
                          {text}
                          {isCorrect && <span className="ml-2">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                      <span className="font-medium">Explanation:</span> {q.explanation}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>Source: {q.source}</span>
                    {q.creator_name && <span>By: {q.creator_name}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
