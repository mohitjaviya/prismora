import { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Send, Bot, User, Sparkles, Trash2, Copy, Check, X } from 'lucide-react';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SUGGESTED_QUESTIONS = [
  'What are the total sales this month?',
  'Which salesperson has the most leads?',
  'Show me all Converted leads',
  'What is the total revenue from Gujarat?',
  'Which product generates the most revenue?',
  'How many pending orders are there?',
];

const buildContext = (leads, orders, users) => {
  const totalRevenue = orders.reduce((s, o) => s + (o.value || 0), 0);
  const totalLeads = leads.length;
  const totalOrders = orders.length;

  const revenueByProduct = {};
  orders.forEach(o => {
    revenueByProduct[o.product] = (revenueByProduct[o.product] || 0) + (o.value || 0);
  });

  const revenueByState = {};
  orders.forEach(o => {
    revenueByState[o.state] = (revenueByState[o.state] || 0) + (o.value || 0);
  });

  const leadsByStatus = {};
  leads.forEach(l => {
    leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
  });

  const revenueByPerson = {};
  orders.forEach(o => {
    const person = users.find(u => u.id === o.assignedTo);
    const name = person?.name || 'Unassigned';
    revenueByPerson[name] = (revenueByPerson[name] || 0) + (o.value || 0);
  });

  const leadsByPerson = {};
  leads.forEach(l => {
    const person = users.find(u => u.id === l.assignedTo);
    const name = person?.name || 'Unassigned';
    leadsByPerson[name] = (leadsByPerson[name] || 0) + 1;
  });

  return `
You are PRISM, an intelligent AI assistant embedded in the PRISMORA CRM system for a personal care products company.
Be concise, use bullet points where appropriate, format numbers with ₹ and commas. Never make up data — only use what's provided.

=== LIVE CRM DATA SUMMARY ===
Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
Total Orders: ${totalOrders}
Total Leads: ${totalLeads}

Revenue by Salesperson: ${JSON.stringify(revenueByPerson)}
Leads by Salesperson: ${JSON.stringify(leadsByPerson)}
Lead Status Breakdown: ${JSON.stringify(leadsByStatus)}
Revenue by Product: ${JSON.stringify(revenueByProduct)}
Revenue by State: ${JSON.stringify(revenueByState)}

=== ALL LEADS (${leads.length}) ===
${leads.map(l => `ID:${l.id} Name:${l.name} Company:${l.company} Status:${l.status} AssignedTo:${users.find(u=>u.id===l.assignedTo)?.name||l.assignedTo} Products:${(l.productInterest||[]).join(', ')} DealValue:₹${(l.dealValue||0).toLocaleString('en-IN')} Source:${l.leadSource||'N/A'} FollowUp:${l.followUpDate ? new Date(l.followUpDate).toLocaleDateString('en-IN') : 'N/A'}`).join('\n')}

=== ALL ORDERS (${orders.length}) ===
${orders.map(o => `ID:${o.id} Customer:${o.customerName} Company:${o.companyName||''} Product:${o.product} Qty:${o.quantity} Value:₹${(o.value||0).toLocaleString('en-IN')} State:${o.state} City:${o.city} Status:${o.status} Salesperson:${users.find(u=>u.id===o.assignedTo)?.name||o.assignedTo} Date:${o.date ? new Date(o.date).toLocaleDateString('en-IN') : 'N/A'}`).join('\n')}
`.trim();
};

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
  const { leads, orders } = useData();
  const { user, users } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryTimerRef = useRef(null);
  const chatContainerRef = useRef(null);

  if (user?.role !== 'Admin') return null;

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  const sendMessage = async (text, isRetry = false) => {
    const question = text || input.trim();
    if (!question || loading) return;

    if (!isRetry) {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', text: question }]);
    }
    setLoading(true);

    try {
      const systemContext = buildContext(leads, orders, users);
      const conversationHistory = messages.map(m => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

      const body = {
        system_instruction: { parts: [{ text: systemContext }] },
        contents: [
          ...conversationHistory,
          { role: 'user', parts: [{ text: question }] }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        }
      };

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      
      if (data.error) {
        const errMsg = data.error.message || '';
        // Check if it's a quota/rate limit error
        const retryMatch = errMsg.match(/retry in (\d+(\.\d+)?)s/i) || errMsg.match(/(\d+(\.\d+)?)\s*s\./i);
        const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;

        if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate') || res.status === 429) {
          // Show countdown message
          setMessages(prev => [...prev, { 
            role: 'ai', 
            text: `⏳ **Rate limit reached.** I'll automatically retry your question in **${retrySeconds} seconds**. Please wait...`,
          }]);
          
          // Start countdown
          setRetryCountdown(retrySeconds);
          let remaining = retrySeconds;
          const tick = () => {
            remaining -= 1;
            setRetryCountdown(remaining);
            if (remaining > 0) {
              retryTimerRef.current = setTimeout(tick, 1000);
            } else {
              setRetryCountdown(0);
              // Remove the countdown message and retry
              setMessages(prev => prev.filter(m => !m.text.includes('Rate limit reached')));
              sendMessage(question, true);
            }
          };
          retryTimerRef.current = setTimeout(tick, 1000);
        } else {
          setMessages(prev => [...prev, { role: 'ai', text: `**API Error:** ${errMsg}` }]);
        }
      } else if (data.candidates && data.candidates.length > 0) {
        const aiText = data.candidates[0]?.content?.parts?.[0]?.text;
        setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `**API Debug Info:** ${JSON.stringify(data)}` }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `**Network Error:** ${e.message}. Please check the console for details.` }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'ai',
      text: `Hello! I'm **PRISM**, your AI business intelligence assistant.\n\nI have access to all your live CRM data — leads, orders, revenue, and team performance. Ask me anything!`,
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
            <p className="text-[10px] text-slate-400 mt-0.5">Live CRM Intelligence</p>
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
        {retryCountdown > 0 && (
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-brand-accent bg-brand-accent/10 border border-brand-accent/20 rounded-xl px-3 py-2">
            <span className="animate-pulse">⏳</span>
            <span>Auto-retrying in <strong>{retryCountdown}s</strong>…</span>
          </div>
        )}
        <div className={`glass-panel border rounded-2xl p-2 flex items-end gap-2 transition-colors ${retryCountdown > 0 ? 'border-brand-accent/30 opacity-60' : 'border-white/10 focus-within:border-brand-accent/50'}`}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={retryCountdown > 0}
            placeholder={retryCountdown > 0 ? `Retrying in ${retryCountdown}s...` : "Ask about sales, leads, team performance... (Enter to send)"}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm resize-none outline-none px-2 py-1.5 max-h-32 custom-scrollbar leading-relaxed disabled:cursor-not-allowed"
            style={{ fieldSizing: 'content' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || retryCountdown > 0}
            className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent disabled:opacity-40 disabled:cursor-not-allowed text-brand-primary p-2.5 rounded-xl transition-all hover:scale-105 flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-1.5">PRISM can make mistakes. Verify important data in the dashboard.</p>
      </div>
    </div>
  );
};

export default AIAssistantWidget;
