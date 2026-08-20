import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Hash,
  Lock,
  Plus,
  Send,
  Paperclip,
  Sparkles,
  Search,
  User as UserIcon,
  Bot,
  Users,
  FileText,
  Download,
  X,
  File,
  Info,
  UserPlus,
  Link as LinkIcon
} from 'lucide-react';
import { connectSocket, getSocket } from '../services/socket';
import { chatApi, ChatChannel, ChatMessage, ChatUser } from '../services/chatApi';
import { useAuthStore } from '../store/authStore';

export const ChatPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id || '';

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeMembers, setActiveMembers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Pending File Upload state
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ id: string; file_name: string; size: string }[]>([]);

  // Modals state
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivateChannel, setIsPrivateChannel] = useState(false);

  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // @Mention Autocomplete State
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionCandidates, setMentionCandidates] = useState<{ id: string; name: string; is_bot?: boolean; role?: string }[]>([]);

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeUnreadCount, setActiveUnreadCount] = useState<number>(0);
  const activeChannelIdRef = useRef<string | null>(null);

  // When Active Channel Changes -> Fetch Messages & Channel Members & Join Socket Room
  useEffect(() => {
    if (!activeChannelId) return;

    const count = unreadCounts[activeChannelId] || 0;
    setActiveUnreadCount(count);
    setUnreadCounts((prev) => ({ ...prev, [activeChannelId]: 0 }));
    activeChannelIdRef.current = activeChannelId;
    setIsTyping(null);
    loadMessages(activeChannelId);
    loadMembers(activeChannelId);

    const socket = getSocket();
    socket.emit('chat:join_channel', { channel_id: activeChannelId });

    return () => {
      socket.emit('chat:leave_channel', { channel_id: activeChannelId });
    };
  }, [activeChannelId]);

  // Fetch Channels and Users on Mount
  useEffect(() => {
    loadInitialData();

    // Socket.IO Connection
    const socket = connectSocket({
      id: currentUserId,
      role: user?.role
    });

    socket.on('chat:message_received', (newMsg: ChatMessage) => {
      if (newMsg.channel_id !== activeChannelIdRef.current && newMsg.sender_id !== currentUserId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [newMsg.channel_id]: (prev[newMsg.channel_id] || 0) + 1
        }));
      }

      // Only append if message belongs to active channel
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
        }
        if (newMsg.channel_id === activeChannelIdRef.current) {
          return [...prev, newMsg];
        }
        return prev;
      });
      scrollToBottom();
    });

    socket.on('chat:typing', (data: { channel_id: string; user_name: string; is_typing: boolean }) => {
      if (data.channel_id === activeChannelIdRef.current) {
        setIsTyping(data.is_typing ? data.user_name : null);
      }
    });

    socket.on('chat:presence_changed', (data: { user_id: string; status: 'online' | 'offline' }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (data.status === 'online') {
          next.add(data.user_id);
        } else {
          next.delete(data.user_id);
        }
        return next;
      });
    });

    return () => {
      socket.off('chat:message_received');
      socket.off('chat:typing');
      socket.off('chat:presence_changed');
    };
  }, []);

  // When Active Channel Changes -> Fetch Messages & Channel Members & Join Socket Room
  useEffect(() => {
    if (!activeChannelId) return;

    loadMessages(activeChannelId);
    loadMembers(activeChannelId);

    // Immediately mark channel as read in DB and clear local unread badge
    chatApi.markRead(activeChannelId).then(() => {
      setUnreadCounts((prev) => ({ ...prev, [activeChannelId]: 0 }));
    }).catch(() => {});

    const socket = getSocket();
    socket.emit('chat:join_channel', { channel_id: activeChannelId });

    return () => {
      socket.emit('chat:leave_channel', { channel_id: activeChannelId });
    };
  }, [activeChannelId]);

  const loadInitialData = async () => {
    try {
      let channelList = await chatApi.getChannels();
      
      const searchParams = new URLSearchParams(window.location.search);
      const inviteCode = searchParams.get('invite');
      if (inviteCode) {
        try {
          const joinRes = await chatApi.joinByInvite(inviteCode);
          if (joinRes.channel_id) {
            channelList = await chatApi.getChannels();
            setActiveChannelId(joinRes.channel_id);
          }
        } catch (e) {
          console.error('Failed to join by invite code', e);
        }
      }

      setChannels(channelList);

      const userList = await chatApi.getChatUsers();
      setUsers(userList);

      const unreadData = await chatApi.getUnreadCount();
      setUnreadCounts(unreadData.by_channel || {});

      if (channelList.length > 0 && !activeChannelId) {
        const defaultChannel = channelList.find((c) => c.name?.toLowerCase() === 'general') || channelList[0];
        setActiveChannelId(defaultChannel.id);
        if (defaultChannel.members) {
          setActiveMembers(defaultChannel.members);
        }
      }
    } catch (err) {
      console.error('Failed to load chat channels or users', err);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!activeChannel) return;
    try {
      let code = activeChannel.invite_code;
      if (!code) {
        const res = await chatApi.getInviteLink(activeChannel.id);
        code = res.invite_code;
      }
      const inviteUrl = `${window.location.origin}/chat?invite=${code}`;
      await navigator.clipboard.writeText(inviteUrl);
      alert(`Group Invite Link Copied!\n\n${inviteUrl}`);
    } catch (err) {
      console.error('Failed to copy invite link', err);
      alert('Failed to copy invite link.');
    }
  };

  const handleJoinInviteCode = async (code: string) => {
    try {
      const res = await chatApi.joinByInvite(code);
      if (res.channel_id) {
        const updated = await chatApi.getChannels();
        setChannels(updated);
        setActiveChannelId(res.channel_id);
        alert(`Successfully joined channel #${res.channel_name || 'Group'}!`);
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to join channel. The invite link may be invalid.');
    }
  };

  const renderMessageContent = (text: string) => {
    if (!text) return null;
    const regex = /(https?:\/\/[^\s]+|@[A-Za-z0-9_.\-\s]{2,30}(?=\s|$|[^A-Za-z0-9_.\-]))/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (part.startsWith('http://') || part.startsWith('https://')) {
        let code = '';
        try {
          const u = new URL(part);
          code = u.searchParams.get('invite') || '';
        } catch (e) {}

        return (
          <React.Fragment key={i}>
            <a
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold text-teal-300 hover:text-white break-all inline-block mx-0.5"
            >
              {part}
            </a>
            {code && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleJoinInviteCode(code);
                }}
                className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-sm transition transform active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Join Group</span>
              </button>
            )}
          </React.Fragment>
        );
      } else if (part.startsWith('@')) {
        return (
          <span
            key={i}
            className="bg-teal-500/20 text-teal-300 font-bold px-1.5 py-0.5 rounded border border-teal-500/30 inline-block mx-0.5 shadow-xs cursor-pointer"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
      const query = textBeforeCursor.slice(lastAt + 1).toLowerCase();
      setMentionQuery(query);

      const botUser = users.find((u) => u.is_bot);
      const memberCandidates = activeMembers.map((m) => ({
        id: m.user_id,
        name: m.full_name,
        is_bot: m.is_bot,
        role: m.job_title
      }));

      if (botUser && !memberCandidates.some((c) => c.id === botUser.user_id)) {
        memberCandidates.push({
          id: botUser.user_id,
          name: botUser.full_name,
          is_bot: true,
          role: 'AI HR Assistant'
        });
      }

      const specialTags = [
        { id: 'tag-channel', name: 'channel', role: 'Notify all channel members' },
        { id: 'tag-here', name: 'here', role: 'Notify active members' }
      ];

      const all = [...memberCandidates, ...specialTags];
      const filtered = all.filter((c) => c.name.toLowerCase().includes(query));

      setMentionCandidates(filtered);
      setIsMentionOpen(filtered.length > 0);
      setMentionIndex(0);
    } else {
      setIsMentionOpen(false);
    }
  };

  const handleSelectMention = (candidateName: string) => {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart || inputText.length;
    const textBeforeCursor = inputText.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    const prefix = inputText.slice(0, lastAt);
    const suffix = inputText.slice(cursor);
    const newText = `${prefix}@${candidateName} `;

    setInputText(newText);
    setIsMentionOpen(false);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = lastAt + candidateName.length + 2;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 50);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isMentionOpen && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionCandidates[mentionIndex].name);
        return;
      } else if (e.key === 'Escape') {
        setIsMentionOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const loadMembers = async (channelId: string) => {
    try {
      const memList = await chatApi.getChannelMembers(channelId);
      setActiveMembers(memList);
    } catch (err) {
      console.error('Failed to load members for channel', channelId, err);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const msgList = await chatApi.getChannelMessages(channelId);
      setMessages(msgList);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load messages for channel', channelId, err);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Handle Send Message (Dual REST + WebSocket delivery for guaranteed reliability)
  const handleSendMessage = async () => {
    if ((!inputText.trim() && pendingAttachments.length === 0) || !activeChannelId) return;

    const contentToSend = inputText;
    const attachmentIds = pendingAttachments.map((a) => a.id);

    setInputText('');
    setPendingAttachments([]);

    try {
      // Primary REST submission guarantees DB storage & Socket.IO room broadcast
      await chatApi.sendMessage(activeChannelId, contentToSend, attachmentIds);
      scrollToBottom();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to send message');
      setInputText(contentToSend);
    }
  };

  // Handle File Attachment Pre-Signed Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChannelId) return;

    try {
      setUploadingFile(true);
      const presignedData = await chatApi.requestPresignedUploadUrl({
        channel_id: activeChannelId,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size
      });

      await chatApi.uploadFileDirect(presignedData.upload_url, file, file.type || 'application/octet-stream');

      const formattedSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      setPendingAttachments((prev) => [
        ...prev,
        { id: presignedData.attachment_id, file_name: file.name, size: formattedSize }
      ]);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to upload document attachment.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle File Download (Pre-Signed GET)
  const handleDownloadAttachment = async (attachmentId: string, fileName: string) => {
    try {
      const downloadUrl = await chatApi.getPresignedDownloadUrl(attachmentId);
      window.open(downloadUrl, '_blank');
    } catch (err) {
      alert('Failed to generate pre-signed download link.');
    }
  };

  // Create Channel
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const res = await chatApi.createChannel({
        name: newChannelName.toLowerCase().replace(/\s+/g, '-'),
        is_private: isPrivateChannel
      });
      setShowCreateChannelModal(false);
      setNewChannelName('');
      await loadInitialData();
      setActiveChannelId(res.channel_id);
    } catch (err) {
      alert('Failed to create channel.');
    }
  };

  // Start DM
  const handleStartDm = async (recipientId: string) => {
    try {
      const res = await chatApi.createChannel({
        is_direct_message: true,
        recipient_id: recipientId
      });
      setShowNewDmModal(false);
      await loadInitialData();
      setActiveChannelId(res.channel_id);
    } catch (err) {
      alert('Failed to start direct message.');
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-1 h-full w-full bg-slate-900 text-slate-100 overflow-hidden font-sans rounded-xl border border-slate-800 shadow-2xl min-h-0">
      {/* 1. LEFT SIDEBAR - CHANNELS & DMS */}
      <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0">
        {/* Workspace Title Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100 tracking-wide">Maxenius HRMS</h2>
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Real-Time Gateway
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation Channels & DMs */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
          {/* Public & Private Group Channels */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Channels</span>
              <button
                onClick={() => setShowCreateChannelModal(true)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
                title="Create Channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-0.5">
              {channels
                .filter((c) => !c.is_direct_message)
                .map((ch) => {
                  const isActive = ch.id === activeChannelId;
                  const unread = unreadCounts[ch.id] || 0;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChannelId(ch.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-all ${
                        isActive
                          ? 'bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/40'
                          : unread > 0
                          ? 'bg-indigo-950/60 font-bold text-white border border-indigo-500/40 shadow-lg ring-1 ring-indigo-500/30'
                          : 'font-normal text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {ch.is_private ? (
                          <Lock className={`w-3.5 h-3.5 shrink-0 ${unread > 0 ? 'text-teal-400' : 'text-slate-400'}`} />
                        ) : (
                          <Hash className={`w-3.5 h-3.5 shrink-0 ${unread > 0 ? 'text-teal-400' : 'text-slate-400'}`} />
                        )}
                        <span className={`truncate ${unread > 0 ? 'font-bold text-white' : 'font-normal text-slate-400'}`}>{ch.name}</span>
                      </div>
                      {unread > 0 && (
                        <span className="ml-auto bg-teal-500 text-slate-950 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Direct Messages */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Direct Messages</span>
              <button
                onClick={() => setShowNewDmModal(true)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
                title="New Direct Message"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-0.5">
              {channels
                .filter((c) => c.is_direct_message)
                .map((ch) => {
                  const isActive = ch.id === activeChannelId;
                  const isOnline = ch.recipient_user_id ? onlineUserIds.has(ch.recipient_user_id) : false;
                  const unread = unreadCounts[ch.id] || 0;

                  return (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChannelId(ch.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-all ${
                        isActive
                          ? 'bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/40'
                          : unread > 0
                          ? 'bg-rose-950/60 font-bold text-white border border-rose-500/40 shadow-lg ring-1 ring-rose-500/30'
                          : 'font-normal text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <div className="relative shrink-0">
                          {ch.name?.includes('Bot') || ch.name?.includes('AI') ? (
                            <Bot className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <UserIcon className={`w-3.5 h-3.5 ${unread > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                          )}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                          />
                        </div>
                        <span className={`truncate ${unread > 0 ? 'font-bold text-white' : 'font-normal text-slate-400'}`}>{ch.name}</span>
                      </div>
                      {unread > 0 && (
                        <span className="ml-auto bg-teal-500 text-slate-950 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Quick HR AI Chatbot Shortcut Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60">
          <button
            onClick={() => {
              const botUser = users.find((u) => u.is_bot);
              if (botUser) handleStartDm(botUser.user_id);
            }}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-violet-500/20 transition-all transform active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ask HR AI Chatbot</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col bg-slate-900 min-w-0">
        {/* Header Bar */}
        {activeChannel ? (
          <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur shrink-0">
            <div className="flex items-center space-x-3 truncate">
              {activeChannel.is_direct_message ? (
                <UserIcon className="w-5 h-5 text-indigo-400 shrink-0" />
              ) : activeChannel.is_private ? (
                <Lock className="w-5 h-5 text-indigo-400 shrink-0" />
              ) : (
                <Hash className="w-5 h-5 text-indigo-400 shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-slate-100 text-base leading-tight truncate">
                  {activeChannel.name || 'Direct Message'}
                </h3>
                <span className="text-xs text-slate-400">
                  {activeChannel.is_direct_message
                    ? '1-on-1 Direct Message'
                    : `${activeMembers.length || activeChannel.member_count} Channel Members`}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {!activeChannel.is_direct_message && (
                <button
                  onClick={handleCopyInviteLink}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/90 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold shadow-sm transition"
                  title="Copy Group Invite Link"
                >
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Invite Link</span>
                </button>
              )}
              <button
                onClick={() => setShowDetailsPanel(!showDetailsPanel)}
                className={`p-2 rounded-lg transition ${
                  showDetailsPanel ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title="Channel Information & Members"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-14 border-b border-slate-800" />
        )}

        {/* Messages Stream Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar min-h-0">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <MessageSquare className="w-12 h-12 stroke-[1.2] text-slate-600" />
              <p className="text-sm font-medium">No messages yet. Send a message to start the conversation!</p>
            </div>
          ) : (
            (() => {
              const unreadStartIndex =
                activeUnreadCount > 0 ? Math.max(0, messages.length - activeUnreadCount) : -1;
              return messages.map((msg, index) => {
                const isBot = msg.sender_type === 'bot';
                const isMe = msg.sender_id === currentUserId;
                const isUnreadStart = index === unreadStartIndex;

                const isMeTagged = user?.employee ? (
                  msg.content.toLowerCase().includes(`@${user.employee.first_name.toLowerCase()}`) ||
                  msg.content.toLowerCase().includes(`@${user.employee.first_name.toLowerCase()} ${user.employee.last_name.toLowerCase()}`) ||
                  msg.content.toLowerCase().includes('@channel') ||
                  msg.content.toLowerCase().includes('@here')
                ) : false;

                return (
                  <React.Fragment key={msg.id}>
                    {isUnreadStart && (
                      <div className="flex items-center my-4 space-x-3">
                        <div className="flex-1 h-[1px] bg-rose-500/50" />
                        <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                          New Unread Messages
                        </span>
                        <div className="flex-1 h-[1px] bg-rose-500/50" />
                      </div>
                    )}
                    <div
                      className={`flex items-start space-x-3 group ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}
                    >
                  {/* Sender Avatar */}
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-md ${
                      isBot
                        ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white'
                        : isMe
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isBot ? <Bot className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                  </div>

                  {/* Message Bubble & Content */}
                  <div className={`max-w-2xl space-y-1 ${isMe ? 'items-end text-right' : ''}`}>
                    <div className="flex items-center space-x-2 px-1">
                      <span className="text-xs font-semibold text-slate-300">{msg.sender_name}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        isMeTagged
                          ? 'bg-teal-950/60 text-slate-100 border-2 border-teal-400/80 shadow-lg shadow-teal-950/50'
                          : isBot
                          ? 'bg-slate-800/90 text-slate-100 border border-violet-500/30 shadow-lg shadow-violet-950/20'
                          : isMe
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50'
                      }`}
                    >
                      {renderMessageContent(msg.content)}

                      {/* Document Attachments Render */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-3 space-y-2 pt-2 border-t border-slate-700/50">
                          {msg.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/50 border border-slate-700/60 hover:border-indigo-500/60 transition group/att"
                            >
                              <div className="flex items-center space-x-2.5 truncate">
                                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                                <span className="text-xs font-medium text-slate-200 truncate">{att.file_name}</span>
                              </div>
                              <button
                                onClick={() => handleDownloadAttachment(att.id, att.file_name)}
                                className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition shrink-0"
                                title="Download Document (Pre-signed URL)"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                  </React.Fragment>
                );
              });
            })()
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center space-x-2 text-xs text-indigo-400 italic py-1 animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isTyping} is typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 relative">
          {/* Mention Autocomplete Floating Popover Panel */}
          {isMentionOpen && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full mb-2 left-4 w-72 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 overflow-hidden font-sans max-h-52 overflow-y-auto divide-y divide-slate-800 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 bg-slate-950/90 border-b border-slate-800 text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span>MENTION MEMBER (@)</span>
                </div>
                <span className="text-[9px] text-slate-500">↑↓ to navigate, Enter to select</span>
              </div>
              {mentionCandidates.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectMention(c.name)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                    idx === mentionIndex ? 'bg-indigo-600/40 text-white font-bold border-l-2 border-indigo-500' : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {c.is_bot ? (
                      <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-100 truncate">@{c.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate">{c.role}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pending Attachments List */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 px-1">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-xs text-indigo-200"
                >
                  <File className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-medium max-w-[150px] truncate">{att.file_name}</span>
                  <span className="text-[10px] text-indigo-400">({att.size})</span>
                  <button
                    onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="p-0.5 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-2 bg-slate-950 p-2 rounded-xl border border-slate-800 focus-within:border-indigo-500 transition-all shadow-inner">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded-lg transition disabled:opacity-50"
              title="Attach Document (S3 Pre-signed Flow)"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setInputText((prev) => prev + ' @HRBot ');
                inputRef.current?.focus();
              }}
              className="p-2 text-slate-400 hover:text-violet-400 hover:bg-slate-900 rounded-lg transition"
              title="Tag @HRBot"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={
                activeChannel?.is_direct_message
                  ? `Message ${activeChannel.name}... (Type @ to mention)`
                  : `Message #${activeChannel?.name || 'general'}... (Type @ to mention members)`
              }
              className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />

            <button
              onClick={handleSendMessage}
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || uploadingFile}
              className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-600/30"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. RIGHT DETAILS & MEMBERS PANEL */}
      {showDetailsPanel && activeChannel && (
        <div className="w-72 bg-slate-950 border-l border-slate-800 flex flex-col shrink-0 p-5 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-sm text-slate-100">Channel Info</h3>
            <button onClick={() => setShowDetailsPanel(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">About</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeChannel.is_direct_message
                ? '1-on-1 Direct Messaging Session.'
                : `Official group channel for ${activeChannel.name}.`}
            </p>
          </div>

          {/* Members List */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Members ({activeMembers.length})
            </h4>
            <div className="space-y-2.5">
              {activeMembers.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        m.is_bot ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {m.is_bot ? <Bot className="w-4 h-4" /> : m.full_name[0]}
                    </div>
                    <div className="truncate min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{m.full_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{m.job_title}</p>
                    </div>
                  </div>
                  {m.role === 'admin' && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/30 shrink-0">
                      Admin
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CHANNEL */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Create Channel</h3>
              <button onClick={() => setShowCreateChannelModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Channel Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="e.g. project-launch"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Make Private</p>
                  <p className="text-xs text-slate-400">Only invited members can view channel</p>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivateChannel}
                  onChange={(e) => setIsPrivateChannel(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowCreateChannelModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30"
              >
                Create Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW DIRECT MESSAGE */}
      {showNewDmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">New Direct Message</h3>
              <button onClick={() => setShowNewDmModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search employees or @HRBot..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
              {filteredUsers.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleStartDm(u.user_id)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-slate-800 rounded-xl transition text-left group"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        u.is_bot ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {u.is_bot ? <Bot className="w-4 h-4" /> : u.full_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200 group-hover:text-indigo-400 transition">
                        {u.full_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {u.job_title} • {u.department}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
