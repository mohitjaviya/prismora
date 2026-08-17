import { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isAdminRole } from '../context/AuthContext';
import { Send, Bot, User, Sparkles, Trash2, Copy, Check, X } from 'lucide-react';
import { askPrism } from '../utils/prismEngine';

const SUGGESTED_QUESTIONS = [
  'What is our net profit margin?',
  'Show me all unpaid or overdue invoices',
  'What are our total expenses and major categories?',
  'What is the total revenue from Gujarat?',
  'Which salesperson has the most leads?',
  'How many pending orders are there?',
  'Forecast demand for next month',
  'Which distributors are at churn risk?',
  'Which products are running low on stock?',
];

const MessageBubble = ({ msg }) => {
  const [copied, setCopied] = useState(false);
  const isAI = msg.role === 'ai';

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format AI response: bold **text**, bullet points
  const formatText = (text) => {
    return text
      .split('\n')
      .map((line, i) => {
        const boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (line.startsWith('* ') || line.startsWith('- ')) {
          return <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: boldFormatted.replace(/^[*-]\s/, '') }} />;
        }
        if (line.startsWith('# ')) {
          return <h3 key={i} className="text-base font-bold text-white mt-2" dangerouslySetInnerHTML={{ __html: boldFormatted.replace(/^#\s/, '') }} />;
        }
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: boldFormatted }} />;
      });
  };

  return (
    <div className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'} group`}>
      {isAI && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-accent to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-accent/20">
          <Bot size={18} className="text-white" />
        </div>
      )}
      <div className={`max-w-[80%] ${isAI ? '' : 'items-end flex flex-col'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed space-y-1 break-all md:break-words whitespace-pre-wrap ${
          isAI
            ? 'bg-brand-primary-light border border-white/10 text-slate-200 rounded-tl-sm'
            : 'bg-gradient-to-br from-brand-accent to-brand-accent-dark text-brand-primary font-medium rounded-tr-sm'
        }`}>
          {isAI ? (
            <div className="space-y-0.5">{formatText(msg.text)}</div>
          ) : (
            msg.text
          )}
        </div>
        {isAI && msg.meta && (
          <div className="mt-1.5 ml-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
              intent: {msg.meta.intent}
            </span>
            {msg.meta.followUp && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                follow-up
              </span>
            )}
            {(msg.meta.corrections || []).map((c, i) => (
              <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {c.from} → {c.to}
              </span>
            ))}
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
              {msg.meta.confidence}% match
            </span>
            {Object.entries(msg.meta.entities || {}).map(([k, v]) => (
              <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {k}: {typeof v === 'object' ? v.label : v}
              </span>
            ))}
          </div>
        )}
        {isAI && (
          <button
            onClick={handleCopy}
            className="mt-1 ml-1 text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {!isAI && (
        <div className="w-9 h-9 rounded-xl bg-brand-primary-light border border-white/10 flex items-center justify-center flex-shrink-0">
          <User size={18} className="text-slate-300" />
        </div>
      )}
    </div>
  );
};

const AIAssistantWidget = ({ onClose, messages, setMessages }) => {
  const { leads, orders, invoices, expenses, inventory, productCatalog, distributors } = useData();
  const { user, users } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef(null);
  const contextRef = useRef(null); // last turn's intent + entities, for follow-ups

  // All hooks must be called before any conditional returns
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isAdminRole(user?.role)) return null;

  const sendMessage = async (text) => {
    const question = text || input.trim();
    if (!question || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    // Brief delay so the typing indicator is perceptible on instant local answers.
    await new Promise(r => setTimeout(r, 250));

    try {
      const result = askPrism(
        question,
        { leads, orders, users, invoices, expenses, inventory, productCatalog, distributors },
        contextRef.current,
      );
      contextRef.current = result.context;
      setMessages(prev => [...prev, {
        role: 'ai',
        text: result.text,
        meta: {
          intent: result.intent,
          confidence: result.confidence,
          entities: result.entities,
          corrections: result.corrections,
          followUp: result.followUp,
        },
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `**Engine error:** ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    contextRef.current = null;
    setMessages([{
      role: 'ai',
      text: `Hello! I'm **PRISM**, your business intelligence assistant.\n\nI work across your live data — orders, leads, invoices, expenses, inventory and distributors — and answer questions instantly.\n\nAsk me anything, or type **help** to see what I can do.`,
    }]);
  };

  return (
    <div className="fixed top-[4.5rem] right-4 bottom-4 w-[420px] max-w-[calc(100vw-5rem)] z-[100] glass-panel bg-brand-primary/98 rounded-2xl shadow-2xl flex flex-col gap-3 p-4 animate-fade-in-up border border-brand-accent/30 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-accent to-purple-600 flex items-center justify-center shadow-lg shadow-brand-accent/30">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">PRISM AI</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Live Business Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            title="Clear Chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Suggested Questions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {SUGGESTED_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="text-xs bg-brand-primary-light border border-white/10 hover:border-brand-accent/50 hover:text-brand-accent text-slate-300 px-3 py-1.5 rounded-full transition-all hover:-translate-y-0.5"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat Messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 min-h-0"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-accent to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-accent/20">
              <Bot size={18} className="text-white" />
            </div>
            <div className="bg-brand-primary-light border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0">
        <div className="glass-panel border border-white/10 rounded-2xl p-2 flex items-end gap-2 focus-within:border-brand-accent/50 transition-colors">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about sales, leads, team performance... (Enter to send)"
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm resize-none outline-none px-2 py-1.5 max-h-32 custom-scrollbar leading-relaxed"
            style={{ fieldSizing: 'content' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent disabled:opacity-40 disabled:cursor-not-allowed text-brand-primary p-2.5 rounded-xl transition-all hover:scale-105 flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-1.5">PRISM reads live data. Verify critical figures in the dashboard.</p>
      </div>
    </div>
  );
};

export default AIAssistantWidget;
