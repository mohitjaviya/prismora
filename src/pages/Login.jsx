import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Lock } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const success = await login(email, password);
    if (success) {
      navigate('/');
    } else {
      setError('Invalid email address or password. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-primary relative overflow-hidden">
      
      {/* Ambient Animated Background — PRISMORA magenta */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-accent/20 blur-[130px] animate-pulse-slow pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-900/25 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-brand-accent-dark/10 blur-[100px] animate-pulse-slow pointer-events-none" style={{ animationDelay: '4s' }}></div>

      {/* Decorative Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utb3BhY2l0eT0iMC4wMyIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTAgNjBoNjBNNjAgMHY2MCIvPjwvZz48L3N2Zz4=')] pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-[420px] px-6">
        
        {/* Logo Section */}
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in-up -mt-12">
          <img src="/logo.png" alt="PRISMORA Logo" className="w-56 md:w-64 h-auto -mt-16 -mb-16 relative z-10 pointer-events-none" />
          <p className="text-slate-400 text-center text-sm relative z-20">Enterprise Sales Intelligence</p>
        </div>

        {/* Login Card */}
        <div className="glass-panel p-6 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">Welcome back</h2>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail size={16} />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="glass-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="glass-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500"
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-xs mt-1.5 font-medium animate-fade-in-up">{error}</p>}
            </div>
            
            <button 
              type="submit"
              className="w-full bg-white text-brand-primary hover:bg-slate-200 font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/10"
            >
              Sign In to Dashboard <ArrowRight size={18} />
            </button>
          </form>


        </div>
        
        <p className="text-center text-xs text-slate-600 mt-4">
          © {new Date().getFullYear()} Janki Herbals Pvt. Ltd.<br/>All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;

