import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, 
  onAuthStateChanged, signOut, updateProfile 
} from "firebase/auth";
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, 
  onSnapshot, addDoc, where, orderBy, updateDoc, 
  arrayUnion, arrayRemove, limit, deleteDoc
} from "firebase/firestore";
import { 
  Camera, Send, Settings, Shield, UserPlus, Image as ImageIcon, 
  Phone, Video, Share2, LogOut, MessageCircle, X, ChevronLeft, 
  Plus, MoreVertical, Trash2, Mic, Palette, Bell, Lock, Eye, 
  Search, CheckCheck, Smile, Paperclip, Zap, Crown, UserMinus
} from 'lucide-react';

// =========================================================
// 1. КОНФИГУРАЦИЯ (FIREBASE & CONSTANTS)
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyAbfPtl2auXZeiFlTBgrw5HUR742SlBM88",
  authDomain: "gawr-69377.firebaseapp.com",
  databaseURL: "https://gawr-69377-default-rtdb.firebaseio.com",
  projectId: "gawr-69377",
  storageBucket: "gawr-69377.firebasestorage.app",
  messagingSenderId: "89649220321",
  appId: "1:89649220321:web:479e1aa4ee08517a5cc5a0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Цветовые пресеты "Gawr Neon"
const THEMES = {
  'neon-red': { primary: '#ff0000', glow: 'rgba(255, 0, 0, 0.6)', bg: '#080000' },
  'neon-green': { primary: '#00ff41', glow: 'rgba(0, 255, 65, 0.6)', bg: '#000802' },
  'neon-blue': { primary: '#00d2ff', glow: 'rgba(0, 210, 255, 0.6)', bg: '#000408' },
  'neon-purple': { primary: '#bc13fe', glow: 'rgba(188, 19, 254, 0.6)', bg: '#050008' },
  'classic-gold': { primary: '#ffd700', glow: 'rgba(255, 215, 0, 0.6)', bg: '#0a0a00' }
};

// =========================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ (UI KIT)
// =========================================================

// Неоновая кнопка
const NeonButton = ({ onClick, children, theme, active = true, style }) => (
  <button 
    onClick={onClick}
    style={{
      background: active ? theme.primary : 'transparent',
      color: active ? '#000' : theme.primary,
      border: `2px solid ${theme.primary}`,
      padding: '14px 20px',
      borderRadius: '12px',
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      cursor: 'pointer',
      boxShadow: active ? `0 0 20px ${theme.glow}` : 'none',
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      ...style
    }}
  >
    {children}
  </button>
);

// Неоновый инпут
const NeonInput = ({ value, onChange, placeholder, theme, type = "text", icon: Icon }) => (
  <div style={{ position: 'relative', width: '100%', marginBottom: '15px' }}>
    {Icon && <Icon size={20} color={theme.primary} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />}
    <input 
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        border: 'none',
        borderBottom: `2px solid ${theme.primary}`,
        padding: Icon ? '15px 15px 15px 50px' : '15px',
        color: '#fff',
        fontSize: '16px',
        outline: 'none',
        borderRadius: '8px 8px 0 0',
        transition: 'all 0.3s ease',
        boxSizing: 'border-box'
      }}
      onFocus={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
      onBlur={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
    />
  </div>
);

// =========================================================
// 3. ГЛАВНЫЙ МОДУЛЬ GAWR
// =========================================================

export default function GawrMessenger() {
  // Состояния пользователя
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Состояния навигации
  const [currentView, setCurrentView] = useState('auth'); // auth, register, hub, chat, settings, paint, call
  const [activeTheme, setActiveTheme] = useState(THEMES['neon-red']);
  
  // Состояния мессенджера
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stories, setStories] = useState([]);
  const [contacts, setContacts] = useState([]);
  
  // Вспомогательные состояния
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Референсы для рисования (Gawr Paint)
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#ff0000');

  // ---------------------------------------------------------
  // ЖИЗНЕННЫЙ ЦИКЛ & FIREBASE AUTH
  // ---------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userDoc = await getDoc(doc(db, "users", u.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile(data);
          if (data.themeId && THEMES[data.themeId]) {
            setActiveTheme(THEMES[data.themeId]);
          }
          setCurrentView('hub');
        } else {
          setCurrentView('register');
        }
      } else {
        setCurrentView('auth');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ---------------------------------------------------------
  // ЛОГИКА АВТОРИЗАЦИИ (СМС И КОДЫ)
  // ---------------------------------------------------------
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => console.log('reCAPTCHA solved')
      });
    }
  };

  const handleSendOtp = async () => {
    setupRecaptcha();
    try {
      const confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      window.confirmationResult = confirmation;
      setIsOtpSent(true);
      alert("Код отправлен. Если используешь GAWR CODES — введи его сейчас.");
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      await window.confirmationResult.confirm(otp);
    } catch (err) {
      alert("Неверный код доступа.");
    }
  };

  // ---------------------------------------------------------
  // РЕГИСТРАЦИЯ И ПРОФИЛЬ
  // ---------------------------------------------------------
  const completeRegistration = async (username, fullname) => {
    if (!username || !fullname) return;
    const uLower = username.toLowerCase();
    
    // Проверка занятости ника
    const nameCheck = await getDoc(doc(db, "usernames", uLower));
    if (nameCheck.exists()) return alert("Этот ник уже занят другим Гавром!");

    const newProfile = {
      uid: user.uid,
      username: uLower,
      name: fullname,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uLower}`,
      themeId: 'neon-red',
      status: 'Available',
      lastSeen: Date.now(),
      isAdmin: false,
      isPremium: false,
      gawrPoints: 0
    };

    await setDoc(doc(db, "users", user.uid), newProfile);
    await setDoc(doc(db, "usernames", uLower), { uid: user.uid });
    setProfile(newProfile);
    setCurrentView('hub');
  };

  // ---------------------------------------------------------
  // МЕНЕДЖЕР ЧАТОВ
  // ---------------------------------------------------------
  useEffect(() => {
    if (!user || currentView !== 'hub') return;

    const q = query(
      collection(db, "chats"), 
      where("members", "array-contains", user.uid),
      orderBy("lastActivity", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const chatList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChats(chatList);
    });

    return unsub;
  }, [user, currentView]);

  const createNewChat = async (targetUsername) => {
    const uRef = await getDoc(doc(db, "usernames", targetUsername.toLowerCase()));
    if (!uRef.exists()) return alert("Пользователь не найден.");
    
    const targetUid = uRef.data().uid;
    const chatId = [user.uid, targetUid].sort().join("_");

    const chatData = {
      id: chatId,
      members: [user.uid, targetUid],
      type: 'direct',
      lastActivity: Date.now(),
      createdAt: Date.now(),
      name: targetUsername
    };

    await setDoc(doc(db, "chats", chatId), chatData);
    enterChat(chatData);
  };

  const enterChat = (chat) => {
    setActiveChat(chat);
    setCurrentView('chat');
    // Загрузка сообщений
    const q = query(
      collection(db, `chats/${chat.id}/messages`), 
      orderBy("createdAt", "asc"),
      limit(100)
    );
    onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => d.data()));
    });
  };

  const postMessage = async () => {
    if (!msgInput.trim()) return;
    const msg = {
      text: msgInput,
      senderId: user.uid,
      senderName: profile.name,
      createdAt: Date.now(),
      type: 'text'
    };
    await addDoc(collection(db, `chats/${activeChat.id}/messages`), msg);
    await updateDoc(doc(db, "chats", activeChat.id), { lastActivity: Date.now() });
    setMsgInput("");
  };

  // ---------------------------------------------------------
  // GAWR PAINT (РИСОВАНИЕ СТОРИС)
  // ---------------------------------------------------------
  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(offsetX, offsetY);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const saveStory = () => {
    const dataUrl = canvasRef.current.toDataURL();
    // Логика сохранения в Firebase Storage была бы тут
    alert("Сторис сохранена локально (в демо-режиме)!");
    setCurrentView('hub');
  };

  // ---------------------------------------------------------
  // ГЕНЕРАЦИЯ ИНВАЙТ-ССЫЛКИ
  // ---------------------------------------------------------
  const copyGawrInvite = () => {
    const link = `${window.location.origin}/#invite=${profile.username}`;
    navigator.clipboard.writeText(link);
    alert("Твоя неоновая ссылка скопирована: " + link);
  };

  // ---------------------------------------------------------
  // ГЛАВНЫЕ СТИЛИ КОНТЕЙНЕРА
  // ---------------------------------------------------------
  const containerStyle = {
    backgroundColor: activeTheme.bg,
    color: '#fff',
    minHeight: '100vh',
    maxHeight: '100vh',
    width: '100vw',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    position: 'relative'
  };

  // =========================================================
  // 4. РЕНДЕРИНГ ЭКРАНОВ
  // =========================================================

  // --- ЭКРАН ЗАГРУЗКИ ---
  if (loading) return (
    <div style={{ ...containerStyle, justifyContent: 'center', alignItems: 'center' }}>
      <Zap size={60} color={activeTheme.primary} className="animate-pulse" />
      <h2 style={{ color: activeTheme.primary, marginTop: '20px', letterSpacing: '5px' }}>GAWR LOADING...</h2>
    </div>
  );

  return (
    <div style={containerStyle}>
      
      {/* --- ЭКРАН АВТОРИЗАЦИИ --- */}
      {currentView === 'auth' && (
        <div style={{ padding: '40px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '50px' }}>
            <h1 style={{ fontSize: '70px', fontWeight: '900', color: activeTheme.primary, textShadow: `0 0 30px ${activeTheme.glow}`, margin: 0 }}>GAWR</h1>
            <p style={{ opacity: 0.5, letterSpacing: '2px' }}>NEXT-GEN MESSENGER</p>
          </div>

          {!isOtpSent ? (
            <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
              <NeonInput 
                placeholder="+7 (999) 000-00-00" 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                theme={activeTheme}
                icon={Phone}
              />
              <NeonButton theme={activeTheme} onClick={handleSendOtp} style={{ marginTop: '20px' }}>
                Войти через СМС
              </NeonButton>
              <div id="recaptcha-container"></div>
            </div>
          ) : (
            <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
              <NeonInput 
                placeholder="Код из СМС или Гавр-Код" 
                value={otp} 
                onChange={e => setOtp(e.target.value)} 
                theme={activeTheme}
                icon={Lock}
              />
              <NeonButton theme={activeTheme} onClick={handleVerifyOtp} style={{ marginTop: '20px' }}>
                Подтвердить
              </NeonButton>
              <p onClick={() => setIsOtpSent(false)} style={{ marginTop: '20px', color: activeTheme.primary, fontSize: '12px', cursor: 'pointer' }}>Изменить номер</p>
            </div>
          )}
        </div>
      )}

      {/* --- ЭКРАН РЕГИСТРАЦИИ --- */}
      {currentView === 'register' && (
        <div style={{ padding: '40px', flex: 1 }}>
          <h2 style={{ ...styles.h2, color: activeTheme.primary }}>Создай свой профиль</h2>
          <NeonInput 
            placeholder="@username" 
            id="reg_uname" 
            theme={activeTheme} 
            icon={UserPlus}
          />
          <NeonInput 
            placeholder="Ваше имя" 
            id="reg_name" 
            theme={activeTheme} 
            icon={Smile}
          />
          <NeonButton 
            theme={activeTheme} 
            onClick={() => completeRegistration(
              document.getElementById('reg_uname').value, 
              document.getElementById('reg_name').value
            )}
          >
            Начать общение
          </NeonButton>
        </div>
      )}

      {/* --- ГЛАВНЫЙ ЭКРАН (HUB) --- */}
      {currentView === 'hub' && (
        <>
          {/* Header */}
          <div style={{ padding: '20px', borderBottom: `1px solid ${activeTheme.primary}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <img 
              src={profile?.avatar} 
              style={{ width: '45px', height: '45px', borderRadius: '50%', border: `2px solid ${activeTheme.primary}`, cursor: 'pointer' }}
              onClick={() => setCurrentView('settings')}
            />
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, color: activeTheme.primary, fontSize: '18px', fontWeight: '900' }}>GAWR HUB</h3>
              <div style={{ fontSize: '10px', opacity: 0.5 }}>{profile?.username}</div>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <Search size={22} color={activeTheme.primary} />
              <Bell size={22} color={activeTheme.primary} />
            </div>
          </div>

          {/* Stories Bar */}
          <div style={{ display: 'flex', gap: '15px', padding: '20px', overflowX: 'auto', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
            <div 
              onClick={() => setCurrentView('paint')}
              style={{ minWidth: '65px', height: '65px', borderRadius: '50%', border: `2px dashed ${activeTheme.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Plus size={30} color={activeTheme.primary} />
            </div>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ minWidth: '65px', height: '65px', borderRadius: '50%', border: `2px solid ${activeTheme.primary}`, padding: '2px' }}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=st${i}`} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>

          {/* Chat List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px' }}>
              <span style={{ fontSize: '12px', opacity: 0.5, textTransform: 'uppercase' }}>Ваши переписки</span>
              <UserPlus size={16} color={activeTheme.primary} onClick={() => {
                const n = prompt("Введите @username:");
                if(n) createNewChat(n);
              }} />
            </div>
            
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => enterChat(chat)}
                style={{ 
                  padding: '15px', 
                  marginBottom: '10px', 
                  borderRadius: '15px', 
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ position: 'relative' }}>
                  <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${chat.name}`} style={{ width: '50px', height: '50px', borderRadius: '15px' }} />
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '12px', height: '12px', background: activeTheme.primary, borderRadius: '50%', border: '2px solid #000' }}></div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{chat.name}</div>
                  <div style={{ fontSize: '13px', opacity: 0.5 }}>Нажмите, чтобы открыть чат...</div>
                </div>
                <div style={{ fontSize: '10px', opacity: 0.3 }}>12:45</div>
              </div>
            ))}
          </div>

          {/* Bottom Tabs */}
          <div style={{ height: '70px', borderTop: `1px solid rgba(255,255,255,0.05)`, display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}>
            <MessageCircle size={24} color={activeTheme.primary} />
            <Phone size={24} color="#555" />
            <div style={{ width: '50px', height: '50px', background: activeTheme.primary, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-30px', boxShadow: `0 0 20px ${activeTheme.glow}` }}>
              <Plus size={30} color="#000" />
            </div>
            <ImageIcon size={24} color="#555" />
            <Settings size={24} color="#555" onClick={() => setCurrentView('settings')} />
          </div>
        </>
      )}

      {/* --- ОКНО ЧАТА --- */}
      {currentView === 'chat' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Chat Header */}
          <div style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px', borderBottom: `1px solid ${activeTheme.primary}33`, background: 'rgba(0,0,0,0.5)' }}>
            <ChevronLeft size={28} onClick={() => setCurrentView('hub')} />
            <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${activeChat.name}`} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold' }}>{activeChat.name}</div>
              <div style={{ fontSize: '11px', color: activeTheme.primary }}>online</div>
            </div>
            <Phone size={22} color={activeTheme.primary} onClick={() => setCurrentView('call')} />
            <Shield size={22} color={activeTheme.primary} onClick={() => setShowAdminPanel(!showAdminPanel)} />
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.senderId === user.uid ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                padding: '12px 16px',
                borderRadius: m.senderId === user.uid ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                background: m.senderId === user.uid ? activeTheme.primary : 'rgba(255,255,255,0.08)',
                color: m.senderId === user.uid ? '#000' : '#fff',
                fontSize: '15px',
                boxShadow: m.senderId === user.uid ? `0 4px 15px ${activeTheme.glow}` : 'none',
                position: 'relative'
              }}>
                {m.text}
                <div style={{ fontSize: '9px', opacity: 0.5, textAlign: 'right', marginTop: '4px' }}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          {/* Admin Panel Overlay */}
          {showAdminPanel && (
            <div style={{ position: 'absolute', top: '70px', right: '10px', width: '200px', background: '#111', border: `1px solid ${activeTheme.primary}`, borderRadius: '12px', zMount: 100, padding: '10px' }}>
              <div style={{ fontSize: '10px', color: activeTheme.primary, marginBottom: '10px', textTransform: 'uppercase' }}>Управление чатом</div>
              <div style={styles.adminItem}><Zap size={14} /> Сделать админом</div>
              <div style={styles.adminItem}><Crown size={14} /> Дать Premium</div>
              <div style={{ ...styles.adminItem, color: '#ff4444' }}><UserMinus size={14} /> Удалить Гавра</div>
            </div>
          )}

          {/* Input Area */}
          <div style={{ padding: '15px', background: '#050505', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Paperclip size={24} color="#555" />
            <div style={{ flex: 1, position: 'relative' }}>
              <input 
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && postMessage()}
                placeholder="Твое сообщение..."
                style={{ width: '100%', background: '#1a1a1a', border: 'none', padding: '12px 15px', borderRadius: '25px', color: '#fff', outline: 'none' }}
              />
              <Smile size={20} color="#555" style={{ position: 'absolute', right: '15px', top: '10px' }} />
            </div>
            <div 
              onClick={postMessage}
              style={{ width: '45px', height: '45px', background: activeTheme.primary, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 15px ${activeTheme.glow}` }}
            >
              <Send size={20} color="#000" />
            </div>
          </div>
        </div>
      )}

      {/* --- GAWR PAINT (РИСОВАЛКА СТОРИС) --- */}
      {currentView === 'paint' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000' }}>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between' }}>
            <X onClick={() => setCurrentView('hub')} />
            <h3 style={{ color: activeTheme.primary, margin: 0 }}>GAWR PAINT</h3>
            <CheckCheck onClick={saveStory} color={activeTheme.primary} />
          </div>
          
          <canvas 
            ref={canvasRef}
            width={window.innerWidth}
            height={window.innerHeight - 200}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={() => setIsDrawing(false)}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = canvasRef.current.getBoundingClientRect();
              startDrawing({ nativeEvent: { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top } });
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              const rect = canvasRef.current.getBoundingClientRect();
              draw({ nativeEvent: { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top } });
            }}
            onTouchEnd={() => setIsDrawing(false)}
            style={{ flex: 1, cursor: 'crosshair', background: '#111' }}
          />

          <div style={{ height: '100px', display: 'flex', gap: '15px', padding: '20px', overflowX: 'auto' }}>
            {['#ff0000', '#00ff41', '#00d2ff', '#bc13fe', '#ffd700', '#ffffff'].map(c => (
              <div 
                key={c} 
                onClick={() => setBrushColor(c)}
                style={{ minWidth: '40px', height: '40px', background: c, borderRadius: '50%', border: brushColor === c ? '3px solid #fff' : 'none' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* --- ЭКРАН НАСТРОЕК --- */}
      {currentView === 'settings' && (
        <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
          <ChevronLeft size={30} onClick={() => setCurrentView('hub')} style={{ marginBottom: '20px' }} />
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={profile?.avatar} style={{ width: '120px', height: '120px', borderRadius: '40px', border: `3px solid ${activeTheme.primary}`, boxShadow: `0 0 30px ${activeTheme.glow}` }} />
              <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', background: activeTheme.primary, padding: '8px', borderRadius: '50%' }}><Camera size={20} color="#000" /></div>
            </div>
            <h2 style={{ marginTop: '20px', marginBottom: '5px' }}>{profile?.name}</h2>
            <div style={{ color: activeTheme.primary, fontSize: '14px' }}>@{profile?.username}</div>
          </div>

          <div style={styles.settingsSection}>
            <h4 style={{ color: activeTheme.primary, textTransform: 'uppercase', fontSize: '11px', marginBottom: '15px' }}>Внешний вид</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {Object.keys(THEMES).map(t => (
                <div 
                  key={t} 
                  onClick={() => {
                    setActiveTheme(THEMES[t]);
                    updateDoc(doc(db, "users", user.uid), { themeId: t });
                  }}
                  style={{ width: '45px', height: '45px', background: THEMES[t].primary, borderRadius: '12px', border: activeTheme === THEMES[t] ? '3px solid #fff' : 'none' }}
                />
              ))}
            </div>
          </div>

          <div style={styles.settingsSection} onClick={copyGawrInvite}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <Share2 color={activeTheme.primary} />
              <div>
                <div style={{ fontWeight: 'bold' }}>Пригласить друга</div>
                <div style={{ fontSize: '12px', opacity: 0.5 }}>Получи Gawr Points за каждого</div>
              </div>
            </div>
          </div>

          <div style={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <Palette color={activeTheme.primary} />
              <div style={{ flex: 1 }}>Неоновый режим</div>
              <div style={{ width: '40px', height: '20px', background: activeTheme.primary, borderRadius: '10px', position: 'relative' }}>
                <div style={{ width: '16px', height: '16px', background: '#000', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }}></div>
              </div>
            </div>
          </div>

          <NeonButton theme={activeTheme} onClick={() => signOut(auth)} style={{ marginTop: '40px', borderColor: '#333', color: '#666' }}>
            <LogOut size={20} /> Выйти из системы
          </NeonButton>
        </div>
      )}

      {/* --- ЭКРАН ЗВОНКА (CALL UI) --- */}
      {currentView === 'call' && (
        <div style={{ flex: 1, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '60px 20px' }}>
          <div style={{ textAlign: 'center' }}>
            <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${activeChat.name}`} style={{ width: '150px', height: '150px', borderRadius: '50%', border: `4px solid ${activeTheme.primary}`, boxShadow: `0 0 50px ${activeTheme.glow}` }} />
            <h2 style={{ marginTop: '30px', fontSize: '32px' }}>{activeChat.name}</h2>
            <div className="animate-pulse" style={{ color: activeTheme.primary, letterSpacing: '3px' }}>ЗВОНОК...</div>
          </div>

          <div style={{ display: 'flex', gap: '30px' }}>
            <div style={{ ...styles.callBtn, background: '#ff4444' }} onClick={() => setCurrentView('chat')}>
              <Phone size={30} style={{ transform: 'rotate(135deg)' }} />
            </div>
            <div style={{ ...styles.callBtn, background: '#222' }}>
              <Mic size={30} />
            </div>
            <div style={{ ...styles.callBtn, background: activeTheme.primary, color: '#000' }}>
              <Video size={30} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// =========================================================
// 5. ДОПОЛНИТЕЛЬНЫЕ СТИЛИ (ОБЪЕКТ СТИЛЕЙ)
// =========================================================
const styles = {
  h2: {
    fontSize: '28px',
    fontWeight: '900',
    marginBottom: '30px',
    textTransform: 'uppercase'
  },
  settingsSection: {
    background: 'rgba(255,255,255,0.03)',
    padding: '20px',
    borderRadius: '15px',
    marginBottom: '15px',
    border: '1px solid rgba(255,255,255,0.05)',
    cursor: 'pointer'
  },
  adminItem: {
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.05)'
  },
  callBtn: {
    width: '70px',
    height: '70px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s'
  }
};
