
import React, { useState, useRef, useEffect } from 'react';
import { analyzeGrievanceState } from '../services/geminiService';
import { ChatMessage, Grievance, Status, Department, Severity } from '../types';
import { saveGrievance, getResponsibleStaffId, getCurrentUser } from '../store';

type ChatState = 'IDLE' | 'COLLECTING' | 'REVIEW' | 'DONE';

const GrievanceChatbot: React.FC = () => {
  const currentUser = getCurrentUser();
  const [state, setState] = useState<ChatState>('IDLE');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Identity verified. Greetings, ${currentUser?.name}. I am the AI Redressal Assistant. Briefly state the institutional concern you wish to report.` }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, isTyping]);

  useEffect(() => {
    const handleReset = () => {
      setState('IDLE');
      setIsAnonymous(false);
      setMessages([
        { role: 'assistant', content: `Identity verified. Greetings, ${currentUser?.name}. I am the AI Redressal Assistant. Briefly state the institutional concern you wish to report.` }
      ]);
      setInput('');
      setAnalysis(null);
    };

    window.addEventListener('reset-grievance-chat', handleReset);
    return () => window.removeEventListener('reset-grievance-chat', handleReset);
  }, [currentUser]);

  const addBotMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  };

  const handleSubmission = async (userMessage: string) => {
    setIsTyping(true);
    try {
      if (state === 'IDLE' || state === 'COLLECTING') {
        const result = await analyzeGrievanceState(userMessage, messages);
        setAnalysis(result);

        if (!result.isDetailedEnough) {
          setState('COLLECTING');
          addBotMessage(result.followUpQuestion || "Institutional protocols require more specific details. Please clarify the location and nature of the concern.");
        } else {
          setState('REVIEW');
          addBotMessage(
            `Data extraction complete. I've detected a **${result.sentiment}** tone.\n\n` +
            `**Summary:** ${result.summary}\n` +
            `**Dept:** ${result.department}\n` +
            `**Impact:** ${result.severity.toUpperCase()}\n` +
            `**Proposed Status:** ${result.initialStatus}\n\n` +
            `Type **'Confirm'** to finalize filing.`
          );
        }
      } else if (state === 'REVIEW') {
        if (/confirm|yes|correct|ok|submit/i.test(userMessage)) {
          await finalizeGrievance();
        } else {
          addBotMessage("Re-analyzing session context...");
          const updatedResult = await analyzeGrievanceState(userMessage, messages);
          setAnalysis(updatedResult);
          addBotMessage(`Revised Summary: ${updatedResult.summary}\n\nProceed?`);
        }
      }
    } catch (e) {
      addBotMessage("Infrastructure error: AI gateway timeout.");
    } finally {
      setIsTyping(false);
    }
  };

  const finalizeGrievance = async () => {
    const grievanceId = 'KIT-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
    const now = Date.now();
    const dept = (analysis?.department as Department) || Department.OTHER;
    const staffId = await getResponsibleStaffId(dept);
    const initialStatus = (analysis?.initialStatus as Status) || Status.PENDING;

    const newGrievance: Grievance = {
      id: grievanceId,
      title: analysis?.summary || "General Concern",
      timestamp: now,
      description: messages.filter(m => m.role === 'user').map(m => m.content).join('\n'),
      department: dept,
      severity: (analysis?.severity as Severity) || Severity.LOW,
      status: initialStatus,
      isAnonymous: isAnonymous,
      studentId: currentUser?.id || 'ANON',
      assignedToId: staffId, 
      lastStatusChange: now,
      history: [{ status: initialStatus, timestamp: now, userId: 'SYSTEM', remark: `Case registered with initial status: ${initialStatus}` }],
      remarks: [],
      notificationsSent: [{ type: 'EMAIL', timestamp: now, message: 'Filing Confirmation Sent' }],
      conversation: [],
      sentiment: analysis?.sentiment,
      summary: analysis?.summary
    };

    await saveGrievance(newGrievance);
    addBotMessage(`✅ **Verified.** Ref: **#${grievanceId}**.\n\nRouted to **${dept}**. ${isAnonymous ? "Filing is Anonymous." : "Filing linked to profile."}`);
    setState('DONE');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    const msg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    handleSubmission(msg);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-14rem)] bg-white rounded-[32px] border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-500">
      <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center font-black border border-white/20">AI</div>
          <div>
            <h3 className="font-black text-lg tracking-tight leading-none mb-1">KIT UGRS Assistant</h3>
            <p className="text-[10px] opacity-60 font-black uppercase tracking-[0.2em]">Institutional Redressal Pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">Anonymous Filing</span>
            <div className="relative">
              <input 
                type="checkbox" 
                checked={isAnonymous} 
                onChange={() => setIsAnonymous(!isAnonymous)}
                className="w-5 h-5 accent-indigo-400 cursor-pointer"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/20 custom-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-7 py-4 rounded-[24px] text-sm font-semibold shadow-sm border ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-none' 
                : 'bg-white text-slate-700 border-slate-200 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 p-2">
            <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
          </div>
        )}
        <div ref={scrollRef}></div>
      </div>

      <div className="p-8 bg-white border-t border-slate-100">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={state === 'DONE' ? "Filing session complete." : "Describe the institutional concern..."}
            disabled={state === 'DONE' || isTyping}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-7 py-5 text-sm font-semibold focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none transition-all"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isTyping || state === 'DONE'} 
            className="bg-slate-900 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-200 disabled:opacity-30"
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};

export default GrievanceChatbot;
