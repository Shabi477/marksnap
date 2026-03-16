import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testsAPI, classesAPI, resultsAPI } from '../services/api';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import {
  ClipboardCheck, Download, Camera, BarChart3,
  Users, ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Assessments() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTest, setExpandedTest] = useState(null);
  const [downloadingSheets, setDownloadingSheets] = useState(null);

  useEffect(() => {
    Promise.all([
      testsAPI.list().then(r => r.data),
      classesAPI.list().then(r => r.data),
    ]).then(([t, c]) => {
      setTests(t);
      setClasses(c);
    }).finally(() => setLoading(false));
  }, []);

  const handleDownloadSheets = async (testId, classId, testName, className) => {
    const key = `${testId}-${classId}`;
    setDownloadingSheets(key);
    try {
      const res = await testsAPI.downloadSheets(testId, classId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${testName}_${className}_sheets.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Sheets downloaded!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to download sheets');
    }
    setDownloadingSheets(null);
  };

  const handleExportResults = async (testId, classId, testName, className) => {
    try {
      const res = await resultsAPI.export(testId, classId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${testName}_${className}_results.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Results exported!');
    } catch (err) {
      toast.error('No results yet or export failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  const totalQuestions = (test) =>
    test.sections?.reduce((sum, s) => sum + s.num_questions, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-brand-600" />
          Assessments
        </h1>
        <p className="page-subtitle">
          Select an assessment, print marksheets for your class, scan them in, and view results
        </p>
      </div>

      {/* How it works - only show if no tests yet */}
      {tests.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No assessments available yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Assessments will appear here once your school admin sets them up.
            Contact your HOD or school admin to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => {
            const expanded = expandedTest === test.id;
            const qCount = totalQuestions(test);

            return (
              <div key={test.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Test header */}
                <button
                  onClick={() => setExpandedTest(expanded ? null : test.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{test.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        {test.subject_name && (
                          <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                            {test.subject_name}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{qCount} questions</span>
                        {test.has_answer_key && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            Answer key set
                          </span>
                        )}
                        {!test.has_answer_key && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            No answer key
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expanded
                    ? <ChevronUp className="w-5 h-5 text-gray-400" />
                    : <ChevronDown className="w-5 h-5 text-gray-400" />
                  }
                </button>

                {/* Expanded: class actions */}
                {expanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    {classes.length === 0 ? (
                      <div className="text-center py-6 text-gray-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No classes set up yet.</p>
                        <button
                          onClick={() => navigate('/classes')}
                          className="text-sm text-brand-600 hover:text-brand-700 mt-1"
                        >
                          Create a class first →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">Choose a class:</p>
                        {classes.map(cls => (
                          <div
                            key={cls.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                                <Users className="w-4 h-4 text-gray-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{cls.name}</p>
                                <p className="text-xs text-gray-500">
                                  {cls.student_count || 0} students
                                  {cls.year_group ? ` · ${cls.year_group}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Download Sheets */}
                              <button
                                onClick={() => handleDownloadSheets(test.id, cls.id, test.name, cls.name)}
                                disabled={downloadingSheets === `${test.id}-${cls.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                                title="Download answer sheets PDF"
                              >
                                {downloadingSheets === `${test.id}-${cls.id}` ? (
                                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                Sheets
                              </button>

                              {/* Scan */}
                              <button
                                onClick={() => navigate(`/scan/${test.id}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                                title="Upload scanned sheets"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                Scan
                              </button>

                              {/* Results */}
                              <button
                                onClick={() => navigate(`/results/${test.id}?class_id=${cls.id}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 transition-colors"
                                title="View results & analysis"
                              >
                                <BarChart3 className="w-3.5 h-3.5" />
                                Results
                              </button>

                              {/* Export */}
                              <button
                                onClick={() => handleExportResults(test.id, cls.id, test.name, cls.name)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                                title="Export results to Excel"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Export
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
