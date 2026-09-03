import React, { useState, useEffect } from 'react';
import { db } from '../db';
import * as XLSX from 'xlsx';
import { useAuth } from '../AuthContext';

export default function Visitors() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDate, setFilterDate] = useState('');
    const [visitors, setVisitors] = useState([]);
    const { user } = useAuth();

    useEffect(() => {
        const load = async () => {
            try {
                const data = await db.visitors.toArray();
                setVisitors(data || []);
            } catch (err) {
                console.error("Error loading visitors:", err);
            }
        };
        load();
        const interval = setInterval(load, 4000);
        return () => clearInterval(interval);
    }, []);

    const filteredVisitors = visitors.filter(v => {
        const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (v.company && v.company.toLowerCase().includes(searchTerm.toLowerCase()));
                              
        const matchesStatus = filterStatus === 'all' || v.status === filterStatus;
        
        let matchesDate = true;
        if (filterDate) {
            const vDate = new Date(v.checkInTime).toISOString().split('T')[0];
            matchesDate = vDate === filterDate;
        }
        
        return matchesSearch && matchesStatus && matchesDate;
    }).sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

    const exportToExcel = () => {
        if (user?.role !== 'admin') return;
        const data = filteredVisitors.map(v => ({
            ID: v.id,
            Name: v.name,
            Phone: v.phone,
            Company: v.company,
            Host: v.hostName,
            Purpose: v.purpose,
            Status: v.status,
            CheckIn: new Date(v.checkInTime).toLocaleString(),
            CheckOut: v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : '-'
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Visitors");
        
        XLSX.writeFile(workbook, "Visitors_Export.xlsx");
    };

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString([], {
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute:'2-digit'
        });
    };

    return (
        <section className="view-section active">
            <div className="glass-panel list-container" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                    <div className="filters-bar" style={{ display: 'flex', gap: '16px', flex: 1 }}>
                        <div className="search-box" style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                            <i className="fa-solid fa-search" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}></i>
                            <input 
                                type="text" 
                                placeholder="Search by name, ID, or company..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px 10px 40px', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', color: 'var(--text-primary)' }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="checked-in">Checked In</option>
                            <option value="checked-out">Checked Out</option>
                        </select>
                        <input 
                            type="date" 
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 16px', color: 'var(--text-primary)', colorScheme: 'dark' }}
                        />
                    </div>
                    {user?.role === 'admin' && (
                        <button className="btn btn-outline" onClick={exportToExcel}>
                            <i className="fa-solid fa-file-export"></i> Export Excel
                        </button>
                    )}
                </div>

                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Photo</th>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Host / Purpose</th>
                                <th>Check-In</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVisitors.length === 0 ? (
                                <tr>
                                    <td colSpan="7">
                                        <div className="empty-state">No visitors found matching your criteria.</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredVisitors.map(v => (
                                    <tr key={v.id}>
                                        <td><span className="badge-id" style={{fontFamily: 'monospace', fontSize:'12px'}}>{v.id}</span></td>
                                        <td>
                                            {v.photoData ? 
                                                <img src={v.photoData} className="avatar-sm" alt="visitor" /> : 
                                                <div className="avatar-placeholder">{v.name.charAt(0)}</div>
                                            }
                                        </td>
                                        <td><strong>{v.name}</strong><br/><span style={{fontSize:'12px', color:'var(--text-secondary)'}}>{v.company || '-'}</span></td>
                                        <td>{v.phone}</td>
                                        <td>{v.hostName}<br/><span style={{fontSize:'12px', color:'var(--text-secondary)'}}>{v.purpose}</span></td>
                                        <td>{formatTime(v.checkInTime)}</td>
                                        <td>
                                            <span className={`status-badge ${v.status === 'checked-in' ? 'status-in' : 'status-out'}`}>
                                                {v.status === 'checked-in' ? 'Checked In' : 'Checked Out'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
