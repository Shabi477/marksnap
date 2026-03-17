import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { classesAPI, testsAPI } from '../services/api';
import { Users, FileText, ScanLine, BarChart3, Plus, ArrowRight, Camera } from 'lucide-react';

export default function Dashboard() {
  const { teacher } = useAuth();
  const [classes, setClasses] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([classesAPI.list(), testsAPI.list()])
      .then(([classRes, testRes]) => {
        setClasses(classRes.data);
        setTests(testRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="page-title">Welcome back, {teacher?.name?.split(' ')[0]}!</h1>
        <p className="page-subtitle">
          {teacher?.role === 'hod'
            ? `Managing ${teacher?.school_name || 'your school'}`
            : teacher?.school_name
              ? `${teacher?.school_name}`
              : "Here's what's happening with your tests."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Classes" value={classes.length} color="brand" />
        <StatCard icon={Users} label="Students" value={totalStudents} color="emerald" />
        <StatCard icon={FileText} label="Tests" value={tests.length} color="amber" />
        <StatCard icon={ScanLine} label="Scans" value="—" color="cyan" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link to="/classes" className="card flex flex-col items-center gap-3 group cursor-pointer text-center py-6">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center group-hover:bg-brand-200 transition-colors">
              <Plus className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Add Class</p>
              <p className="text-xs text-gray-500 mt-0.5">Set up students</p>
            </div>
          </Link>

          <Link to="/tests" className="card flex flex-col items-center gap-3 group cursor-pointer text-center py-6">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Create Test</p>
              <p className="text-xs text-gray-500 mt-0.5">Design sheets</p>
            </div>
          </Link>

          {tests.length > 0 ? (
            <Link to={`/live-scan/${tests[0].id}`} className="card flex flex-col items-center gap-3 group cursor-pointer text-center py-6 ring-1 ring-brand-200 bg-brand-50/50">
              <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center group-hover:bg-brand-600 transition-colors">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-brand-700 text-sm">Scan Now</p>
                <p className="text-xs text-brand-600/70 mt-0.5">{tests[0].name}</p>
              </div>
            </Link>
          ) : (
            <div className="card flex flex-col items-center gap-3 text-center py-6 opacity-50">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                <Camera className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-500 text-sm">Scan</p>
                <p className="text-xs text-gray-400 mt-0.5">Create a test first</p>
              </div>
            </div>
          )}

          <Link to="/results" className="card flex flex-col items-center gap-3 group cursor-pointer text-center py-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <BarChart3 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Results</p>
              <p className="text-xs text-gray-500 mt-0.5">View scores</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent tests */}
      {tests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Tests</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.slice(0, 6).map((test) => (
              <div key={test.id} className="card group">
                <Link to={`/tests/${test.id}`} className="block">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                        {test.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {test.sections?.length || 0} section(s) •{' '}
                        {test.sections?.reduce((sum, s) => sum + s.num_questions, 0) || 0} questions
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors mt-1" />
                  </div>
                </Link>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to={`/live-scan/${test.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" /> Scan
                  </Link>
                  <Link
                    to={`/results/${test.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Results
                  </Link>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Created {new Date(test.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    brand: 'bg-brand-100 text-brand-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    cyan: 'bg-brand-100 text-brand-600',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
