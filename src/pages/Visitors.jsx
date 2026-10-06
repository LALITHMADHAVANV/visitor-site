import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import * as XLSX from 'xlsx';
import { useAuth } from '../AuthContext';
import { getVisitorPhoto } from '../avatarUtils';

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

    const filteredVisitors = useMemo(() => {
        return visitors.filter(v => {
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch = !term || 
                                  v.name?.toLowerCase().includes(term) || 
                                  v.id?.toLowerCase().includes(term) ||
                                  (v.visitorNo && v.visitorNo.toLowerCase().includes(term)) ||
                                  (v.idNumber && v.idNumber.toLowerCase().includes(term)) ||
                                  (v.idType && v.idType.toLowerCase().includes(term)) ||
                                  (v.company && v.company.toLowerCase().includes(term)) ||
                                  (v.phone && v.phone.includes(term)) ||
                                  (v.extraMembersIds && v.extraMembersIds.toLowerCase().includes(term)) ||
                                  (v.hostName && v.hostName.toLowerCase().includes(term));
                                  
            const matchesStatus = filterStatus === 'all' || v.status === filterStatus;
            
            let matchesDate = true;
            if (filterDate) {
                const time = v.checkInTime || v.created_at;
                if (!time) {
                    matchesDate = false;
                } else {
                    const vDate = new Date(time).toISOString().split('T')[0];
                    matchesDate = vDate === filterDate;
                }
            }
            
            return matchesSearch && matchesStatus && matchesDate;
        }).sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
    }, [visitors, searchTerm, filterStatus, filterDate]);

    const exportToExcel = () => {
        if (user?.role !== 'admin') return;
        const data = filteredVisitors.map((v, index) => ({
            'S.No': index + 1,
            'Visitor ID': v.visitorNo || v.id,
            'Full Name': v.name,
            'Phone Number': v.phone || '-',
            'ID Proof Type': v.idType || '-',
            'ID Proof Number': v.idNumber || '-',
            'Company / Organization': v.company || '-',
            'To Meet': v.hostName,
            'Purpose of Visit': v.purpose || '-',
            'Vehicle Number': v.vehicleNo || 'No',
            'Extra Members': v.hasExtraMembers === 'yes' ? `${v.extraMembersCount} (${v.extraMembersIds || ''})` : 'No',
            'Status': v.status === 'checked-in' ? 'Inside' : 'Checked Out',
            'Check-In Time': v.checkInTime ? new Date(v.checkInTime).toLocaleString() : '-',
            'Check-Out Time': v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : '-'
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Visitors");
        
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Esstee_Visitors_Report_${dateStr}.xlsx`);
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString([], {
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute:'2-digit'
        });
    };

    const hasActiveFilters = searchTerm !== '' || filterStatus !== 'all' || filterDate !== '';

    const resetFilters = () => {
        setSearchTerm('');
        setFilterStatus('all');
        setFilterDate('');
    };

    return (
        <section className="visitors-history-page">
            <div className="glass-panel" style={{ background: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Search & Filters Toolbar */}
                <div style={{ 
                    padding: '16px 20px', 
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    gap: '14px' 
                }}>
                    <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
                        {/* Search Input */}
                        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '380px' }}>
                            <i className="fa-solid fa-search" style={{ 
                                position: 'absolute', 
                                left: '12px', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                color: 'var(--text-muted)',
                                fontSize: '13px'
                            }}></i>
                            <input 
                                type="text" 
                                placeholder="Search by name, ID, phone, company, host..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '8px 30px 8px 34px', 
                                    border: '1px solid var(--border-color)', 
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    background: '#f8fafc',
                                    outline: 'none'
                                }}
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '4px'
                                    }}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}
                        </div>

                        {/* Status Select */}
                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '8px', 
                                padding: '8px 14px', 
                                fontSize: '13px',
                                background: '#f8fafc',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="checked-in">Currently Inside</option>
                            <option value="checked-out">Checked Out</option>
                        </select>

                        {/* Date Filter */}
                        <input 
                            type="date" 
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            style={{ 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '8px', 
                                padding: '8px 12px', 
                                fontSize: '13px',
                                background: '#f8fafc',
                                color: 'var(--text-primary)',
                                outline: 'none'
                            }}
                        />

                        {hasActiveFilters && (
                            <button 
                                className="btn btn-secondary btn-sm"
                                onClick={resetFilters}
                                title="Reset all filters"
                            >
                                <i className="fa-solid fa-arrow-rotate-left"></i> Reset
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                            {filteredVisitors.length} {filteredVisitors.length === 1 ? 'record' : 'records'}
                        </span>

                        {user?.role === 'admin' && (
                            <button className="btn btn-secondary btn-sm" onClick={exportToExcel} title="Export to Excel Spreadsheet">
                                <i className="fa-solid fa-file-excel" style={{ color: '#059669' }}></i>
                                <span>Export Excel</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Data Table */}
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                <th>Visitor ID</th>
                                <th>Visitor</th>
                                <th style={{ textAlign: 'center' }}>Persons</th>
                                <th>Phone</th>
                                <th>ID Proof</th>
                                <th>To Meet</th>
                                <th>Vehicle</th>
                                <th>Check-In</th>
                                <th>Check-Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVisitors.length === 0 ? (
                                <tr>
                                    <td colSpan="11">
                                        <div className="empty-state">
                                            <i className="fa-regular fa-folder-open empty-state-icon"></i>
                                            <p>No visitor history records match your search criteria.</p>
                                            {hasActiveFilters && (
                                                <button 
                                                    className="btn btn-secondary btn-sm" 
                                                    style={{ marginTop: '12px' }}
                                                    onClick={resetFilters}
                                                >
                                                    Clear All Filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredVisitors.map((v, index) => {
                                    const extraCount = v.hasExtraMembers === 'yes' ? (parseInt(v.extraMembersCount, 10) || 0) : 0;
                                    const totalPersons = 1 + extraCount;
                                    const rawExtraIds = v.extraMembersIds || '';
                                    const parsedIds = rawExtraIds ? rawExtraIds.split(/[,/;\n]+/).map(s => s.trim()).filter(Boolean) : [];
                                    const accompanyingIds = parsedIds.length > 0 
                                        ? parsedIds 
                                        : (extraCount > 0 ? Array.from({ length: extraCount }, (_, i) => `${v.visitorNo || v.id}-M${i + 1}`) : []);

                                    return (
                                        <React.Fragment key={v.id}>
                                            <tr>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                    {index + 1}
                                                </td>
                                                <td>
                                                    <span className="badge-id" style={{ fontFamily: 'monospace', fontSize: '11.5px', fontWeight: '700' }}>
                                                        {v.visitorNo || v.id}
                                                    </span>
                                                    {extraCount > 0 && (
                                                        <div style={{ marginTop: '4px' }}>
                                                            <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                                +{extraCount} Member ID{extraCount > 1 ? 's' : ''}:
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
                                                                {accompanyingIds.map((accId, i) => (
                                                                    <span key={i} className="badge-id" style={{ fontFamily: 'monospace', fontSize: '10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                                                        {accId}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <img 
                                                            src={getVisitorPhoto(v)} 
                                                            className="avatar-sm" 
                                                            alt={v.name} 
                                                        />
                                                        <div>
                                                            <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{v.name}</strong>
                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                                {v.company || '-'}
                                                            </span>
                                                            {extraCount > 0 && (
                                                                <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <i className="fa-solid fa-users" style={{ fontSize: '10px' }}></i>
                                                                    <span>Group ({totalPersons} persons)</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ 
                                                        fontWeight: '700', 
                                                        fontSize: totalPersons > 1 ? '14px' : '12.5px',
                                                        color: totalPersons > 1 ? 'var(--primary)' : 'var(--text-secondary)',
                                                        display: 'block'
                                                    }}>
                                                        {totalPersons}
                                                    </span>
                                                    {extraCount > 0 ? (
                                                        <span style={{ 
                                                            fontSize: '9.5px', 
                                                            background: '#e0f2fe', 
                                                            color: '#0369a1', 
                                                            padding: '1px 5px', 
                                                            borderRadius: '4px', 
                                                            fontWeight: '600',
                                                            display: 'inline-block',
                                                            marginTop: '2px'
                                                        }}>
                                                            1 + {extraCount}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Single</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{v.phone || '-'}</span>
                                                </td>
                                                <td>
                                                    {v.idType ? (
                                                        <div>
                                                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: '600', display: 'block' }}>
                                                                {v.idType}
                                                            </span>
                                                            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#475569' }}>
                                                                {v.idNumber || '-'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{v.hostName}</div>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        {v.purpose || '-'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '12.5px', color: v.vehicleNo && v.vehicleNo !== 'No' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                        {v.vehicleNo || 'No'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '12.5px', fontWeight: '500' }}>
                                                        {formatDateTime(v.checkInTime)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '12.5px', color: v.checkOutTime ? 'var(--text-primary)' : 'var(--success)' }}>
                                                        {v.checkOutTime ? formatDateTime(v.checkOutTime) : 'Active Inside'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${v.status === 'checked-in' ? 'status-in' : 'status-out'}`}>
                                                        <i className={`fa-solid ${v.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`} style={{ fontSize: '10px' }}></i>
                                                        {v.status === 'checked-in' ? 'Inside' : 'Checked Out'}
                                                    </span>
                                                </td>
                                            </tr>
                                            {/* Accompanying Members Sub-rows: Show Visitor ID number only */}
                                            {extraCount > 0 && accompanyingIds.map((accId, accIdx) => (
                                                <tr key={`${v.id}-extra-${accIdx}`} style={{ background: '#f8fafc', borderLeft: '3px solid #93c5fd' }}>
                                                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                                                        ↳
                                                    </td>
                                                    <td>
                                                        <span className="badge-id" style={{ 
                                                            fontFamily: 'monospace', 
                                                            fontSize: '11px', 
                                                            background: '#eff6ff', 
                                                            color: '#1d4ed8', 
                                                            border: '1px solid #bfdbfe',
                                                            fontWeight: '600'
                                                        }}>
                                                            {accId}
                                                        </span>
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            Accompanying ID #{accIdx + 1}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                            <div className="avatar-placeholder" style={{ width: '24px', height: '24px', fontSize: '10px', background: '#e2e8f0', color: '#64748b' }}>
                                                                <i className="fa-solid fa-user"></i>
                                                            </div>
                                                            <div>
                                                                <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Accompanying Member #{accIdx + 1}</span>
                                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>with {v.name}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                                                        1
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                        -
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                        -
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{v.hostName}</div>
                                                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{v.purpose || '-'}</div>
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                        {v.vehicleNo || 'No'}
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                            {formatDateTime(v.checkInTime)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '12px', color: v.checkOutTime ? 'var(--text-secondary)' : 'var(--success)' }}>
                                                            {v.checkOutTime ? formatDateTime(v.checkOutTime) : 'Active Inside'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${v.status === 'checked-in' ? 'status-in' : 'status-out'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                            <i className={`fa-solid ${v.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`} style={{ fontSize: '9px' }}></i>
                                                            {v.status === 'checked-in' ? 'Inside' : 'Checked Out'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
