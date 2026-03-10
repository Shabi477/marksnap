import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { testsAPI, classesAPI } from '../services/api';
import {
  ArrowLeft, Download, ScanLine, BarChart3, Save, FileText, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const OPTIONS = ['A', 'B', 'C', 'D', 'E'];

export default function TestDetail() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [classes, setClasses] = useState([]);
  const [answerKey, setAnswerKey] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      testsAPI.get(testId),
      testsAPI.getAnswerKey(testId),
      classesAPI.list(),
    ]).then(([testRes, keyRes, classRes]) => {
      setTest(testRes.data);
      setClasses(classRes.data);

      // Build answer key state
      const existingKeys = {};
      keyRes.data.forEach((k) => {
        existingKeys[`${k.section_name}_${k.question_number}`] = k.correct_answer;
      });

      // Initialize all questions
      const allKeys = [];
      let qNum = 1;
      for (const sec of testRes.data.sections || []) {
        for (let i = 0; i < sec.num_questions; i++) {
          const key = `${sec.section_name}_${qNum}`;
          allKeys.push({
            question_number: qNum,
            section_name: sec.section_name,
            correct_answer: existingKeys[key] || '',
            num_options: sec.num_options,
          });
          qNum++;
        }
      }
      setAnswerKey(allKeys);
    }).finally(() => setLoading(false));
  }, [testId]);

  const handleAnswerChange = (idx, value) => {
    const updated = [...answerKey];
    updated[idx] = { ...updated[idx], correct_answer: value };
    setAnswerKey(updated);
  };

  const handleSaveKey = async () => {
    const filled = answerKey.filter((a) => a.correct_answer);
    if (filled.length === 0) {
      toast.error('Please fill in at least one answer');
      return;
    }

    setSaving(true);
    try {
      await testsAPI.setAnswerKey(testId, {
        answers: filled.map((a) => ({
          question_number: a.question_number,
          section_name: a.section_name,
          correct_answer: a.correct_answer,
        })),
      });
      toast.success('Answer key saved!');
    } catch (err) {
      toast.error('Failed to save answer key');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSheets = async () => {
    if (!selectedClass) {
      toast.error('Select a class first');
      return;
    }
    try {
      const res = await testsAPI.downloadSheets(testId, selectedClass);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `marksnap_answer_sheets.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Answer sheets downloaded!');
    } catch (err) {
      toast.error('Failed to download sheets');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!test) {
    return <p className="text-gray-500">Test not found.</p>;
  }

  const totalQuestions = test.sections?.reduce((s, sec) => s + sec.num_questions, 0) || 0;
  const filledAnswers = answerKey.filter((a) => a.correct_answer).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/tests" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">{test.name}</h1>
          <p className="page-subtitle">
            {test.sections?.length} section(s) • {totalQuestions} questions
          </p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="card flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 flex items-center gap-3">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="input-field max-w-xs"
          >
            <option value="">Select a class...</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name} ({cls.student_count} students)</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleDownloadSheets} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Sheets
          </button>
          <Link to={`/scan/${testId}`} className="btn-primary flex items-center gap-2">
            <ScanLine className="w-4 h-4" />
            Scan Answers
          </Link>
          <Link to={`/results/${testId}`} className="btn-secondary flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            View Results
          </Link>
        </div>
      </div>

      {/* Answer Key */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Answer Key</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {filledAnswers} of {totalQuestions} answers set
              {filledAnswers === totalQuestions && (
                <span className="ml-2 text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleSaveKey}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Key
          </button>
        </div>

        {/* Answer grid grouped by section */}
        {test.sections?.map((section) => {
          const sectionAnswers = answerKey.filter((a) => a.section_name === section.section_name);
          return (
            <div key={section.section_name} className="mb-6">
              <h3 className="text-sm font-semibold text-brand-600 mb-3 uppercase tracking-wide">
                Section {section.section_name}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
                {sectionAnswers.map((q, idx) => {
                  const globalIdx = answerKey.indexOf(q);
                  return (
                    <div key={q.question_number} className="flex items-center gap-1.5 p-2 bg-gray-50 rounded-lg">
                      <span className="text-xs font-bold text-gray-500 w-6 text-right">
                        {q.question_number}.
                      </span>
                      <div className="flex gap-0.5">
                        {OPTIONS.slice(0, q.num_options).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleAnswerChange(globalIdx, opt)}
                            className={`w-7 h-7 rounded-full text-xs font-semibold transition-all duration-150 ${
                              q.correct_answer === opt
                                ? 'bg-brand-500 text-white shadow-sm scale-110'
                                : 'bg-white text-gray-400 border border-gray-200 hover:border-brand-300 hover:text-brand-500'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
