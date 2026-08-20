import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';

export const AuditPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const res = await api.get('/audit-logs');
      setAuditLogs(res.data.audit_logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5 text-[#0D9488]" />
            AUDIT TRAIL & SYSTEM ACTIVITY LOGS
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Immutable audit record of user logins, role modifications, salary edits, and system actions
          </p>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">TIMESTAMP</th>
                <th className="p-4">USER EMAIL</th>
                <th className="p-4">ACTION CODE</th>
                <th className="p-4">ENTITY TYPE</th>
                <th className="p-4">ENTITY ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-mono">
              {auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-4 text-[#64748B]">{log.created_at?.replace('T', ' ').substring(0, 19)}</td>
                    <td className="p-4 font-sans font-medium text-[#0F172A]">{log.user_email}</td>
                    <td className="p-4 font-bold text-[#0D9488]">{log.action}</td>
                    <td className="p-4 text-[#334155]">{log.entity_type || '—'}</td>
                    <td className="p-4 text-[#64748B] text-[11px] truncate max-w-xs">{log.entity_id || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#64748B] font-mono">
                    {loading ? 'LOADING AUDIT TRAIL...' : 'NO AUDIT LOGS FOUND.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
