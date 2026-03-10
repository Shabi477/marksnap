import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resultsAPI, classesAPI, testsAPI } from '../services/api';
import { ArrowLeft, Download, BarChart3, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Results() {
  const { testId } = useParams();
  const [test, setTest] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      testsAPI.get(testId),
      classesAPI.list(),
    ]).then(([testRes, classRes]) => {
      setTest(testRes.data);
      setClasses(classRes.data);
    });
  }, [testId]);

  useEffect(() => {
    setLoading(true);
    resultsAPI.get(testId, selectedClass || null)
      .then((res) => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [testId, selectedClass]);

  const handleExport = async () => {
    try {
      const res = await resultsAPI.export(testId, selectedClass || null);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `marksnap_${test?.name || 'results'}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel file downloaded!');
    } catch (err) {
      toast.error('Failed to export results');
    }
  };

  // Get all question keys
  const allQuestions = results.length > 0
    ? Object.keys(results[0].answers).sort((a, b) => {
        const numA = parseInt(a.replace('Q', ''));
        const numB = parseInt(b.replace('Q', ''));
        return numA - numB;
      })
    : [];

  const avgScore = results.length > 0
    ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/tests/${testId}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">Results</h1>
          <p className="page-subtitle">{test?.name || 'Loading...'}</p>
        </div>
        <button onClick={handleExport} className="btn-primary flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Filters & summary */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="card flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="input-field"
          >
            <option value="">All classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </div>
        <div className="card flex-1 flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-brand-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{avgScore}%</p>
            <p className="text-sm text-gray-500">Average score ({results.length} students)</p>
          </div>
        </div>
      </div>

      {/* Results table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : results.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No results yet</h3>
          <p className="text-gray-500 mt-1">Scan some answer sheets to see results here.</p>
          <Link to={`/scan/${testId}`} className="btn-primary mt-4 inline-flex items-center gap-2">
            Scan Answers
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                  Student
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Class
                </th>
                {allQuestions.map((q) => (
                  <th key={q} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {q}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {results.map((student) => (
                <tr key={student.student_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                    {student.student_name}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 text-center">
                    {student.class_name}
                  </td>
                  {allQuestions.map((q) => {
                    const answer = student.answers[q];
                    const correct = student.correct[q];
                    return (
                      <td key={q} className="px-2 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                          answer
                            ? correct
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {answer || '-'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 text-center">
                    {student.score}/{student.total}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <span className={`text-sm font-bold ${
                      student.percentage >= 70
                        ? 'text-emerald-600'
                        : student.percentage >= 50
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}>
                      {student.percentage}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
