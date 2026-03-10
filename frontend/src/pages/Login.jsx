import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, Eye, EyeOff, School, User, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

const MODES = {
  LOGIN: 'login',
  REGISTER: 'register',
  REGISTER_SCHOOL: 'register_school',
};

export default function Login() {
  const { login, register, registerSchool, teacher } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(MODES.LOGIN);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (teacher) {
    navigate('/');
    return null;
  }

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setInviteCode('');
    setSchoolName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === MODES.LOGIN) {
        await login(email, password);
        toast.success('Welcome back!');
      } else if (mode === MODES.REGISTER_SCHOOL) {
        await registerSchool(schoolName, name, email, password);
        toast.success('School registered! Welcome to MarkSnap.');
      } else {
        await register(name, email, password, inviteCode);
        toast.success('Account created! Welcome to MarkSnap.');
      }
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500 rounded-2xl shadow-lg shadow-brand-200 mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">MarkSnap</h1>
          <p className="text-gray-500 mt-1">Scan & grade tests instantly</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
          {mode === MODES.LOGIN ? (
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in to continue</h2>
          ) : mode === MODES.REGISTER_SCHOOL ? (
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Register your school</h2>
          ) : (
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Create your account</h2>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === MODES.REGISTER_SCHOOL && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="input-field"
                  placeholder="Springfield Academy"
                  required
                />
              </div>
            )}

            {mode !== MODES.LOGIN && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Ms. Smith"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="teacher@school.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === MODES.REGISTER && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Invite Code <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input-field"
                  placeholder="e.g. MARK-7X4K"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Leave blank to register as a standalone teacher
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === MODES.LOGIN ? (
                'Sign In'
              ) : mode === MODES.REGISTER_SCHOOL ? (
                'Register School'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Mode switcher */}
          <div className="mt-6 space-y-2">
            {mode === MODES.LOGIN ? (
              <>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setMode(MODES.REGISTER); resetForm(); }}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center justify-center gap-1.5"
                  >
                    <User className="w-3.5 h-3.5" />
                    Register as a teacher
                  </button>
                  <button
                    onClick={() => { setMode(MODES.REGISTER_SCHOOL); resetForm(); }}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center justify-center gap-1.5"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Register your school
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => { setMode(MODES.LOGIN); resetForm(); }}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium block mx-auto"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
