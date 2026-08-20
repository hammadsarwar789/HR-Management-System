import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

export interface ChatUser {
  user_id: string;
  email: string;
  full_name: string;
  job_title: string;
  department: string;
  role?: string;
  is_bot: boolean;
}

export interface ChatChannel {
  id: string;
  name: string | null;
  is_direct_message: boolean;
  is_private: boolean;
  created_by: string | null;
  created_at: string | null;
  recipient_user_id?: string | null;
  invite_code?: string | null;
  member_count: number;
  members?: ChatUser[];
  last_message?: {
    content: string | null;
    sender_type: string | null;
    created_at: string | null;
  } | null;
}

export interface ChatAttachment {
  id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  download_url: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null;
  sender_type: 'user' | 'system' | 'bot';
  sender_name: string;
  content: string;
  is_edited?: boolean;
  created_at: string;
  attachments: ChatAttachment[];
}

export const chatApi = {
  getChannels: async (): Promise<ChatChannel[]> => {
    const response = await axios.get(`${API_BASE_URL}/chat/channels`, getAuthHeaders());
    return response.data.channels || [];
  },

  createChannel: async (data: {
    name?: string;
    is_direct_message?: boolean;
    is_private?: boolean;
    recipient_id?: string;
    member_ids?: string[];
  }): Promise<{ channel_id: string; created: boolean }> => {
    const response = await axios.post(`${API_BASE_URL}/chat/channels`, data, getAuthHeaders());
    return response.data;
  },

  getChannelMembers: async (channelId: string): Promise<ChatUser[]> => {
    const response = await axios.get(`${API_BASE_URL}/chat/channels/${channelId}/members`, getAuthHeaders());
    return response.data.members || [];
  },

  getChannelMessages: async (channelId: string, limit = 100): Promise<ChatMessage[]> => {
    const response = await axios.get(
      `${API_BASE_URL}/chat/channels/${channelId}/messages?limit=${limit}`,
      getAuthHeaders()
    );
    return response.data.messages || [];
  },

  sendMessage: async (channelId: string, content: string, attachmentIds: string[] = []): Promise<ChatMessage> => {
    const response = await axios.post(
      `${API_BASE_URL}/chat/channels/${channelId}/messages`,
      { content, attachment_ids: attachmentIds },
      getAuthHeaders()
    );
    return response.data.message;
  },

  requestPresignedUploadUrl: async (payload: {
    channel_id: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
  }) => {
    const response = await axios.post(`${API_BASE_URL}/chat/files/presigned-url`, payload, getAuthHeaders());
    return response.data;
  },

  uploadFileDirect: async (uploadUrl: string, file: File, contentType: string) => {
    if (uploadUrl.startsWith('/api/v1')) {
      const fullUrl = `${API_BASE_URL.replace('/api/v1', '')}${uploadUrl}`;
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(fullUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } else {
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': contentType },
      });
    }
  },

  getPresignedDownloadUrl: async (attachmentId: string): Promise<string> => {
    const response = await axios.get(`${API_BASE_URL}/chat/files/download/${attachmentId}`, getAuthHeaders());
    const rawUrl = response.data.download_url;
    if (rawUrl.startsWith('/api/v1')) {
      return `${API_BASE_URL.replace('/api/v1', '')}${rawUrl}`;
    }
    return rawUrl;
  },

  getChatUsers: async (): Promise<ChatUser[]> => {
    const response = await axios.get(`${API_BASE_URL}/chat/users`, getAuthHeaders());
    return response.data.users || [];
  },

  getUnreadCount: async (): Promise<{ total_unread: number; by_channel: Record<string, number> }> => {
    const response = await axios.get(`${API_BASE_URL}/chat/unread-count`, getAuthHeaders());
    return response.data || { total_unread: 0, by_channel: {} };
  },

  markRead: async (channelId: string, dmUserId?: string): Promise<{ success: boolean }> => {
    const response = await axios.post(
      `${API_BASE_URL}/chat/mark-read`,
      { channel_id: channelId, dm_user_id: dmUserId },
      getAuthHeaders()
    );
    return response.data;
  },

  getInviteLink: async (channelId: string): Promise<{ invite_code: string; invite_url: string }> => {
    const response = await axios.get(`${API_BASE_URL}/chat/channels/${channelId}/invite-link`, getAuthHeaders());
    return response.data;
  },

  joinByInvite: async (code: string): Promise<{ success: boolean; channel_id: string; channel_name: string }> => {
    const response = await axios.post(`${API_BASE_URL}/chat/channels/join-by-invite`, { invite_code: code }, getAuthHeaders());
    return response.data;
  },
};
