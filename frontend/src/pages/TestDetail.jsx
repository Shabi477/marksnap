import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { testsAPI, classesAPI } from '../services/api';
import Spinner from '../components/Spinner';
import {
  ArrowLeft, Download, ScanLine, BarChart3, Save, FileText, CheckCircle2, Camera,
  ClipboardList, Printer, BookOpen,
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
    try {
      const res = selectedClass
        ? await testsAPI.downloadSheets(testId, selectedClass)
        : await testsAPI.downloadGenericSheets(testId);
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
        <Spinner />
      </div>
    );
  }

  if (!test) {
    return <p className="text-gray-500">Test not found.</p>;
  }

  const totalQuestions = test.sections?.reduce((s, sec) => s + sec.num_questions, 0) || 0;
  const filledAnswers = answerKey.filter((a) => a.correct_answer).length;
  const answerKeyComplete = filledAnswers === totalQuestions && totalQuestions > 0;
  const classSelected = !!selectedClass;

  // Workflow steps
  const steps = [
    { label: 'Set Answer Key', icon: ClipboardList, done: answerKeyComplete, hint: 'Click the bubbles below to mark correct answers' },
    { label: 'Select Class (optional)', icon: BookOpen, done: classSelected, hint: 'Choose a class, or skip to download generic sheets' },
    { label: 'Download & Print Sheets', icon: Printer, done: false, hint: 'Download PDF answer sheets for your students' },
    { label: 'Scan Completed Sheets', icon: Camera, done: false, hint: 'Use your phone camera to scan filled-in sheets' },
    { label: 'View Results', icon: BarChart3, done: false, hint: 'See scores and analytics' },
  ];

  // Determine current active step — skip class selection once answer key is done
  const currentStep = !answerKeyComplete ? 0 : !classSelected ? 1 : 2;

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

      {/* Workflow guide */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">How it works</h2>
        <div className="flex flex-col sm:flex-row gap-1 sm:gap-0">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            const isActive = i === currentStep;
            const isDone = step.done;
            const isPast = i < currentStep;
            return (
              <div key={i} className="flex-1 flex items-center">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg w-full transition-colors ${
                  isDone || isPast ? 'bg-emerald-50' : isActive ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-gray-50'
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isDone || isPast ? 'bg-emerald-500 text-white' : isActive ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isDone || isPast ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${
                      isDone || isPast ? 'text-emerald-700' : isActive ? 'text-brand-700' : 'text-gray-500'
                    }`}>{step.label}</p>
                    {isActive && <p className="text-[10px] text-gray-500 truncate">{step.hint}</p>}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden sm:block w-4 h-0.5 bg-gray-200 shrink-0"></div>
                )}
              </div>
            );
          })}
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
            {selectedClass ? 'Download Sheets' : 'Download Generic Sheets'}
          </button>
          <Link to={`/live-scan/${testId}`} className="btn-primary flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Live Scan
          </Link>
          <Link to={`/scan/${testId}`} className="btn-secondary flex items-center gap-2">
            <ScanLine className="w-4 h-4" />
            Upload Scans
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
          const cardMinWidth = 52 + section.num_options * 48 + (section.num_options - 1) * 8;
          return (
            <div key={section.section_name} className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-6 bg-brand-500 rounded-full"></div>
                <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">
                  Section {section.section_name}
                </h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {sectionAnswers.map((q, sectionIdx) => {
                  const globalIdx = answerKey.findIndex(
                    (a) => a.question_number === q.question_number && a.section_name === q.section_name
                  );
                  return (
                    <div
                      key={q.question_number}
                      className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100"
                      style={{ minWidth: cardMinWidth }}
                    >
                      <span className="text-sm font-bold text-gray-600 w-8 text-right shrink-0">
                        {q.question_number}.
                      </span>
                      <div className="flex gap-2">
                        {OPTIONS.slice(0, q.num_options).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleAnswerChange(globalIdx, opt)}
                            className={`w-10 h-10 rounded-full text-sm font-bold transition-all duration-150 flex items-center justify-center shrink-0 ${
                              q.correct_answer === opt
                                ? 'bg-brand-500 text-white shadow-md ring-2 ring-brand-300 scale-110'
                                : 'bg-white text-gray-500 border-2 border-gray-300 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50'
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
