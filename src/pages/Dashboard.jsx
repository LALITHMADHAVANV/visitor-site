import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import Badge, { THERMAL_80MM_PAGE_STYLE } from '../components/Badge';
import { getVisitorPhoto } from '../avatarUtils';
import './Dashboard.css';

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const badgeRef = useRef();
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [previewVisitor, setPreviewVisitor] = useState(null);
    const [scanPopup, setScanPopup] = useState(null); // { visitor, action: 'checkin' | 'checkout' | 'already-checked-out', timestamp }
    const [allVisitors, setAllVisitors] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'inside', 'checked-out'
    const [searchTerm, setSearchTerm] = useState('');

    const handlePrint = useReactToPrint({
        contentRef: badgeRef,
        documentTitle: selectedVisitor ? `Visitor_Badge_${selectedVisitor.id}` : 'Visitor_Badge',
        pageStyle: THERMAL_80MM_PAGE_STYLE,
    });

    const printBadge = (visitor) => {
        setSelectedVisitor(visitor);
        setTimeout(() => handlePrint(), 100);
    };

    const fetchDashboardData = useCallback(async () => {
        try {
            const visitorsData = await db.visitors.toArray();
            setAllVisitors(visitorsData || []);
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();

        // Supabase Realtime updates
        let channel;
        try {
            channel = supabase
                .channel('dashboard-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, () => {
                    fetchDashboardData();
                })
                .subscribe();
        } catch (e) {
            console.error("Realtime subscription error on dashboard:", e);
        }

        // Real-time updates from hardware barcode/QR scanner or camera scanner
        const handleScanProcessed = async (event) => {
            fetchDashboardData();
            if (event.detail && event.detail.visitor) {
                let v = event.detail.visitor;
                if ((!v.photoData && !v.photo && !v.photoUrl) && (v.id || v.visitorNo)) {
                    try {
                        const fresh = v.id ? await db.visitors.get(v.id) : await db.visitors.where('visitorNo').equals(v.visitorNo).first();
                        if (fresh) v = { ...fresh, ...v };
                    } catch (_e) {}
                }
                setScanPopup({
                    visitor: v,
                    action: event.detail.action || (v.status === 'checked-out' ? 'checkout' : 'checkin'),
                    timestamp: event.detail.timestamp || new Date().toISOString()
                });
            }
        };

        window.addEventListener('visitor-scan-processed', handleScanProcessed);

        // Periodic refresh every 3 seconds for live dashboard
        const interval = setInterval(fetchDashboardData, 3000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('visitor-scan-processed', handleScanProcessed);
            if (channel) supabase.removeChannel(channel);
        };
    }, [fetchDashboardData]);

    // Today's visitors (anyone registered today or currently checked-in inside)
    const todayVisitors = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);

        return allVisitors.filter(v => {
            const time = v.checkInTime || v.created_at;
            if (!time) return false;
            const d = new Date(time);
            return (d >= startOfToday && d < endOfToday) || v.status === 'checked-in';
        });
    }, [allVisitors]);

    const insideVisitors = useMemo(() => {
        return allVisitors.filter(v => v.status === 'checked-in');
    }, [allVisitors]);

    const checkedOutVisitors = useMemo(() => {
        return todayVisitors.filter(v => v.status === 'checked-out');
    }, [todayVisitors]);

    // Helper to check if a visitor has visited before (Old / Returning visitor)
    const isOldVisitor = useCallback((visitor) => {
        if (!visitor) return false;
        const vPhone = (visitor.phone || '').trim();
        const vIdNumber = (visitor.idNumber || '').trim();
        if (!vPhone && !vIdNumber) return false;

        const vTime = new Date(visitor.checkInTime || visitor.created_at || Date.now()).getTime();

        return allVisitors.some(other => {
            if (other.id === visitor.id) return false;
            const matchPhone = vPhone && other.phone && other.phone.trim() === vPhone;
            const matchId = vIdNumber && other.idNumber && other.idNumber.trim() === vIdNumber;
            if (!matchPhone && !matchId) return false;

            const otherTime = new Date(other.checkInTime || other.created_at || 0).getTime();
            return otherTime < vTime;
        });
    }, [allVisitors]);

    const oldVisitors = useMemo(() => {
        return todayVisitors.filter(v => isOldVisitor(v));
    }, [todayVisitors, isOldVisitor]);

    const newVisitors = useMemo(() => {
        return todayVisitors.filter(v => !isOldVisitor(v));
    }, [todayVisitors, isOldVisitor]);

    const handleCheckout = async (id, name) => {
        if (window.confirm(`Check out ${name || 'visitor'} now?`)) {
            const checkOutTime = new Date().toISOString();
            await db.visitors.update(id, {
                status: 'checked-out',
                checkOutTime: checkOutTime
            });
            fetchDashboardData();
            const updated = await db.visitors.get(id);
            if (updated) {
                setScanPopup({
                    visitor: updated,
                    action: 'checkout',
                    timestamp: checkOutTime
                });
            }
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString([], {
            hour: '2-digit', minute:'2-digit'
        });
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString([], {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setPreviewVisitor(null);
                setScanPopup(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Filtered visitors according to search & active tab
    const filteredVisitors = useMemo(() => {
        let baseList = todayVisitors;

        if (statusFilter === 'inside') {
            baseList = insideVisitors;
        } else if (statusFilter === 'checked-out') {
            baseList = checkedOutVisitors;
        } else if (statusFilter === 'new') {
            baseList = newVisitors;
        } else if (statusFilter === 'old') {
            baseList = oldVisitors;
        }

        if (!searchTerm.trim()) {
            return [...baseList].sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
        }

        const term = searchTerm.toLowerCase().trim();
        return baseList.filter(v => 
            v.name?.toLowerCase().includes(term) ||
            v.id?.toLowerCase().includes(term) ||
            v.visitorNo?.toLowerCase().includes(term) ||
            v.extraMembersIds?.toLowerCase().includes(term) ||
            v.company?.toLowerCase().includes(term) ||
            v.hostName?.toLowerCase().includes(term) ||
            v.phone?.includes(term)
        ).sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
    }, [todayVisitors, insideVisitors, checkedOutVisitors, newVisitors, oldVisitors, statusFilter, searchTerm]);

    return (
        <section className="dashboard-page">
            {/* Quick Stat Cards */}
            <div className="stats-grid">
                {/* 1. Total Today */}
                <div 
                    className={`stat-card stat-total ${statusFilter === 'all' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter('all')}
                    role="button"
                    title="Click to view all visitors today"
                >
                    <div className="stat-icon icon-blue">
                        <i className="fa-solid fa-users"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Today</span>
                        <h2 className="stat-value text-primary">{todayVisitors.length}</h2>
                        <span className="stat-subtext">Registered today</span>
                    </div>
                </div>

                {/* 2. Currently Inside */}
                <div 
                    className={`stat-card stat-inside ${statusFilter === 'inside' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'inside' ? 'all' : 'inside')}
                    role="button"
                    title="Click to filter currently inside"
                >
                    <div className="stat-icon icon-green">
                        <i className="fa-solid fa-building-user"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Currently Inside</span>
                        <h2 className="stat-value text-success">{insideVisitors.length}</h2>
                        <span className="stat-subtext">Active on premises</span>
                    </div>
                </div>

                {/* 3. New Visitors */}
                <div 
                    className={`stat-card stat-new ${statusFilter === 'new' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'new' ? 'all' : 'new')}
                    role="button"
                    title="Click to filter new (first-time) visitors today"
                >
                    <div className="stat-icon icon-cyan">
                        <i className="fa-solid fa-user-plus"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">New Visitors</span>
                        <h2 className="stat-value" style={{ color: '#0891b2' }}>{newVisitors.length}</h2>
                        <span className="stat-subtext">First-time today</span>
                    </div>
                </div>

                {/* 3. Old Visitors */}
                <div 
                    className={`stat-card stat-old ${statusFilter === 'old' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'old' ? 'all' : 'old')}
                    role="button"
                    title="Click to filter old (returning) visitors"
                >
                    <div className="stat-icon icon-purple">
                        <i className="fa-solid fa-clock-rotate-left"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Old Visitors</span>
                        <h2 className="stat-value" style={{ color: '#7c3aed' }}>{oldVisitors.length}</h2>
                        <span className="stat-subtext">Returning guests</span>
                    </div>
                </div>
            </div>

            {/* Main Table Card */}
            <div className="glass-panel dashboard-table-card mt-4">
                {/* Card Header & Controls */}
                <div className="table-controls-bar">
                    <div className="controls-left">
                        {/* Tab pills */}
                        <div className="filter-pills">
                            <button 
                                className={`pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('all')}
                            >
                                All (Today) <span className="pill-count">{todayVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'inside' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('inside')}
                            >
                                Currently Inside <span className="pill-count count-green">{insideVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'new' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('new')}
                            >
                                New Visitors <span className="pill-count count-blue">{newVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'old' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('old')}
                            >
                                Old Visitors <span className="pill-count count-purple">{oldVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'checked-out' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('checked-out')}
                            >
                                Checked Out <span className="pill-count">{checkedOutVisitors.length}</span>
                            </button>
                        </div>
                    </div>

                    <div className="controls-right">
                        {/* Search input */}
                        <div className="dashboard-search-wrapper">
                            <i className="fa-solid fa-search search-icon"></i>
                            <input 
                                type="text"
                                className="dashboard-search-input"
                                placeholder="Search by name, ID, host, company..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button 
                                    className="search-clear-btn" 
                                    onClick={() => setSearchTerm('')}
                                    title="Clear search"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}
                        </div>

                        {/* Hardware Barcode Scanner Indicator */}
                        <div className="scanner-status-indicator" title="Hardware USB/Wireless Barcode & QR Scanner Active. Point and scan any visitor pass directly.">
                            <i className="fa-solid fa-barcode"></i>
                            <span>Scanner Ready</span>
                        </div>

                        {/* Real-time Indicator */}
                        <div className="live-status-indicator" title="Dashboard automatically synchronizes in real time">
                            <span className="live-dot"></span>
                            <span className="live-text">Live</span>
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                    <th>Visitor ID</th>
                                    <th>Visitor Details</th>
                                    <th style={{ textAlign: 'center' }}>Persons</th>
                                    <th>To Meet</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredVisitors.length === 0 ? (
                                    <tr>
                                        <td colSpan="9">
                                            <div className="empty-state">
                                                <i className="fa-regular fa-folder-open empty-state-icon"></i>
                                                <p>
                                                    {searchTerm 
                                                        ? `No visitors match "${searchTerm}"`
                                                        : statusFilter === 'inside'
                                                            ? 'No visitors currently inside the premises.'
                                                            : statusFilter === 'new'
                                                                ? 'No new (first-time) visitors recorded today.'
                                                                : statusFilter === 'old'
                                                                    ? 'No old (returning) visitors recorded today.'
                                                                    : 'No visitors recorded for today.'
                                                    }
                                                </p>
                                                {searchTerm && (
                                                    <button 
                                                        className="btn btn-secondary btn-sm" 
                                                        style={{ marginTop: '12px' }}
                                                        onClick={() => setSearchTerm('')}
                                                    >
                                                        Clear Filter
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
                                                <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '12px' }}>
                                                    {index + 1}
                                                </td>
                                                <td>
                                                    <span className="badge-id" style={{ fontFamily: 'monospace', fontSize: '11.5px', fontWeight: '700' }}>
                                                        {v.visitorNo || v.id}
                                                    </span>
                                                    {v.idNumber && (
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            {v.idType ? `${v.idType}: ` : ''}{v.idNumber}
                                                        </div>
                                                    )}
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
                                                        <div 
                                                            className="avatar-clickable" 
                                                            onClick={() => setPreviewVisitor(v)}
                                                            title="Touch / click to view visitor details & photo"
                                                        >
                                                            <img 
                                                                src={getVisitorPhoto(v)} 
                                                                className="avatar-sm" 
                                                                alt={v.name} 
                                                            />
                                                            <div className="avatar-zoom-hint">
                                                                <i className="fa-solid fa-magnifying-glass-plus"></i>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div 
                                                                style={{ fontWeight: '600', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                                onClick={() => setPreviewVisitor(v)}
                                                                title="Touch / click to view visitor details"
                                                            >
                                                                <span>{v.name}</span>
                                                                {isOldVisitor(v) ? (
                                                                    <span className="badge-tag-returning" title="Returning visitor (visited previously)">Old</span>
                                                                ) : (
                                                                    <span className="badge-tag-new" title="First-time visitor">New</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', gap: '6px' }}>
                                                                {v.company && <span>{v.company}</span>}
                                                                {v.phone && <span>• {v.phone}</span>}
                                                            </div>
                                                            {extraCount > 0 && (
                                                                <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                                        fontSize: totalPersons > 1 ? '15px' : '13px',
                                                        color: totalPersons > 1 ? 'var(--primary)' : 'var(--text-secondary)',
                                                        display: 'block'
                                                    }}>
                                                        {totalPersons}
                                                    </span>
                                                    {extraCount > 0 ? (
                                                        <span style={{ 
                                                            fontSize: '10px', 
                                                            background: '#e0f2fe', 
                                                            color: '#0369a1', 
                                                            padding: '2px 5px', 
                                                            borderRadius: '4px', 
                                                            fontWeight: '600',
                                                            display: 'inline-block',
                                                            marginTop: '2px'
                                                        }}>
                                                            1 + {extraCount} Extra
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Single</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '500' }}>{v.hostName}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{v.purpose || 'Visit'}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{formatTime(v.checkInTime)}</div>
                                                </td>
                                                <td>
                                                    {v.checkOutTime ? (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                            {formatTime(v.checkOutTime)}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--success)', fontWeight: '500', fontSize: '12px' }}>
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${v.status === 'checked-in' ? 'status-in' : 'status-out'}`}>
                                                        <i className={`fa-solid ${v.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`} style={{ fontSize: '10px' }}></i>
                                                        {v.status === 'checked-in' ? 'Inside' : 'Checked Out'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                        {v.status === 'checked-in' && (
                                                            <button 
                                                                className="btn btn-outline btn-sm"
                                                                onClick={() => handleCheckout(v.id, v.name)}
                                                                title="Check Out Visitor"
                                                                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                                            >
                                                                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                                                <span>Check Out</span>
                                                            </button>
                                                        )}
                                                        <button 
                                                            className="btn btn-secondary btn-icon" 
                                                            onClick={() => printBadge(v)} 
                                                            title="Print Gate Pass / Badge"
                                                        >
                                                            <i className="fa-solid fa-print"></i>
                                                        </button>
                                                    </div>
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
                                                    <td>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{v.hostName}</div>
                                                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{v.purpose || 'Visit'}</div>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{formatTime(v.checkInTime)}</div>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                            {v.checkOutTime ? formatTime(v.checkOutTime) : <span style={{ color: 'var(--success)', fontWeight: '500' }}>Active</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${v.status === 'checked-in' ? 'status-in' : 'status-out'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                            <i className={`fa-solid ${v.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`} style={{ fontSize: '9px' }}></i>
                                                            {v.status === 'checked-in' ? 'Inside' : 'Checked Out'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                            Group Pass
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
            
            {/* Hidden Badge for Printing */}
            <Badge ref={badgeRef} visitor={selectedVisitor} />

            {/* Visitor Details Modal Popup */}
            {previewVisitor && (
                <div className="visitor-modal-backdrop" onClick={() => setPreviewVisitor(null)}>
                    <div className="visitor-modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="visitor-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fa-solid fa-id-card-clip" style={{ color: 'var(--primary)', fontSize: '18px' }}></i>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    Visitor Details
                                </h3>
                                <span className="badge-id" style={{ fontFamily: 'monospace', fontSize: '11px', marginLeft: '6px' }}>
                                    {previewVisitor.visitorNo || previewVisitor.id}
                                </span>
                            </div>
                            <button 
                                className="visitor-modal-close" 
                                onClick={() => setPreviewVisitor(null)}
                                title="Close (Esc)"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div className="visitor-modal-body">
                            {/* Photo & Identity Section */}
                            <div className="visitor-modal-identity">
                                <div className="visitor-modal-photo-wrapper">
                                    <img 
                                        src={getVisitorPhoto(previewVisitor)} 
                                        alt={previewVisitor.name} 
                                        className="visitor-modal-photo"
                                    />
                                    <span className={`status-badge ${previewVisitor.status === 'checked-in' ? 'status-in' : 'status-out'}`} style={{ marginTop: '8px', fontSize: '11px' }}>
                                        <i className={`fa-solid ${previewVisitor.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`}></i>
                                        {previewVisitor.status === 'checked-in' ? 'Currently Inside' : 'Checked Out'}
                                    </span>
                                </div>

                                <div className="visitor-modal-identity-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <h2 className="visitor-modal-name" style={{ margin: 0 }}>{previewVisitor.name}</h2>
                                        {isOldVisitor(previewVisitor) ? (
                                            <span className="badge-tag-returning" style={{ padding: '2px 8px', fontSize: '11px' }}>
                                                <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '4px' }}></i> Returning Visitor (Old)
                                            </span>
                                        ) : (
                                            <span className="badge-tag-new" style={{ padding: '2px 8px', fontSize: '11px' }}>
                                                <i className="fa-solid fa-user-plus" style={{ marginRight: '4px' }}></i> New Visitor
                                            </span>
                                        )}
                                    </div>
                                    {previewVisitor.company && (
                                        <div className="visitor-modal-company">
                                            <i className="fa-solid fa-building"></i>
                                            <span>{previewVisitor.company}</span>
                                        </div>
                                    )}
                                    {previewVisitor.phone && (
                                        <div className="visitor-modal-phone">
                                            <i className="fa-solid fa-phone"></i>
                                            <a href={`tel:${previewVisitor.phone}`}>{previewVisitor.phone}</a>
                                        </div>
                                    )}
                                    {previewVisitor.idNumber && (
                                        <div className="visitor-modal-idproof">
                                            <i className="fa-solid fa-address-card"></i>
                                            <span>{previewVisitor.idType ? `${previewVisitor.idType}: ` : ''}<strong>{previewVisitor.idNumber}</strong></span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Details Grid: Check In, Check Out, Vehicle No, To Meet */}
                            <div className="visitor-modal-grid">
                                <div className="visitor-detail-card">
                                    <div className="detail-card-icon icon-teal">
                                        <i className="fa-solid fa-clock"></i>
                                    </div>
                                    <div className="detail-card-content">
                                        <span className="detail-card-label">Check-In Time</span>
                                        <span className="detail-card-value">
                                            {formatDateTime(previewVisitor.checkInTime)}
                                        </span>
                                    </div>
                                </div>

                                <div className="visitor-detail-card">
                                    <div className="detail-card-icon icon-orange">
                                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                    </div>
                                    <div className="detail-card-content">
                                        <span className="detail-card-label">Check-Out Time</span>
                                        <span className="detail-card-value">
                                            {previewVisitor.checkOutTime ? (
                                                formatDateTime(previewVisitor.checkOutTime)
                                            ) : (
                                                <span style={{ color: 'var(--success)', fontWeight: '600' }}>Active Inside</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div className="visitor-detail-card">
                                    <div className="detail-card-icon icon-purple">
                                        <i className="fa-solid fa-car"></i>
                                    </div>
                                    <div className="detail-card-content">
                                        <span className="detail-card-label">Vehicle Number</span>
                                        <span className="detail-card-value" style={{ fontFamily: previewVisitor.vehicleNo && previewVisitor.vehicleNo !== 'No' ? 'monospace' : 'inherit' }}>
                                            {previewVisitor.vehicleNo && previewVisitor.vehicleNo !== 'No' ? previewVisitor.vehicleNo : 'No Vehicle'}
                                        </span>
                                    </div>
                                </div>

                                <div className="visitor-detail-card">
                                    <div className="detail-card-icon icon-blue">
                                        <i className="fa-solid fa-user-tie"></i>
                                    </div>
                                    <div className="detail-card-content">
                                        <span className="detail-card-label">To Meet Person</span>
                                        <span className="detail-card-value font-highlight">
                                            {previewVisitor.hostName || '-'}
                                        </span>
                                        {previewVisitor.purpose && (
                                            <span className="detail-card-sub">{previewVisitor.purpose}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Group Members Section if extra members */}
                            {previewVisitor.hasExtraMembers === 'yes' && (
                                <div className="visitor-modal-group-box">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <i className="fa-solid fa-users" style={{ color: '#2563eb' }}></i>
                                        <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>
                                            Accompanying Members ({previewVisitor.extraMembersCount || 1} Persons)
                                        </strong>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#3b82f6' }}>
                                        Member IDs: <strong>{previewVisitor.extraMembersIds || 'Included in main pass'}</strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="visitor-modal-footer">
                            <button 
                                className="btn btn-secondary btn-sm" 
                                onClick={() => printBadge(previewVisitor)}
                                title="Print Badge"
                            >
                                <i className="fa-solid fa-print"></i>
                                <span>Print Badge</span>
                            </button>
                            {previewVisitor.status === 'checked-in' && (
                                <button 
                                    className="btn btn-outline btn-sm"
                                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                    onClick={() => {
                                        const v = previewVisitor;
                                        setPreviewVisitor(null);
                                        handleCheckout(v.id, v.name);
                                    }}
                                    title="Check Out Visitor"
                                >
                                    <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                    <span>Check Out</span>
                                </button>
                            )}
                            <button 
                                className="btn btn-primary btn-sm"
                                onClick={() => setPreviewVisitor(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Live Scan Popup Modal on Check-in / Check-out */}
            {scanPopup && scanPopup.visitor && (
                <div className="scan-popup-backdrop" onClick={() => setScanPopup(null)}>
                    <div className="scan-popup-dialog" onClick={(e) => e.stopPropagation()}>
                        {/* Banner Header based on Scan Action */}
                        <div className={`scan-popup-banner ${
                            scanPopup.action === 'checkout' 
                                ? 'banner-checkout' 
                                : scanPopup.action === 'already-checked-out' 
                                ? 'banner-warning' 
                                : 'banner-checkin'
                        }`}>
                            <div className="scan-banner-left">
                                <div className="scan-banner-icon-box">
                                    <i className={`fa-solid ${
                                        scanPopup.action === 'checkout'
                                            ? 'fa-arrow-right-from-bracket'
                                            : scanPopup.action === 'already-checked-out'
                                            ? 'fa-triangle-exclamation'
                                            : 'fa-circle-check'
                                    }`}></i>
                                </div>
                                <div>
                                    <h3 className="scan-banner-title">
                                        {scanPopup.action === 'checkout'
                                            ? 'VISITOR CHECKED OUT'
                                            : scanPopup.action === 'already-checked-out'
                                            ? 'ALREADY CHECKED OUT'
                                            : 'VISITOR CHECKED IN'}
                                    </h3>
                                    <p className="scan-banner-subtitle">
                                        {scanPopup.action === 'checkout'
                                            ? 'Exit successfully recorded'
                                            : scanPopup.action === 'already-checked-out'
                                            ? 'This pass has already been marked as exited'
                                            : 'Entry access confirmed & pass activated'}
                                    </p>
                                </div>
                            </div>
                            <div className="scan-banner-right">
                                <span className="scan-banner-timestamp">
                                    <i className="fa-regular fa-clock" style={{ marginRight: '5px' }}></i>
                                    {formatTime(scanPopup.timestamp)}
                                </span>
                                <button 
                                    className="scan-banner-close" 
                                    onClick={() => setScanPopup(null)}
                                    title="Close popup (Esc)"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="scan-popup-body">
                            <div className="scan-popup-identity">
                                <div className="scan-popup-photo-box">
                                    <img 
                                        src={getVisitorPhoto(scanPopup.visitor)} 
                                        alt={scanPopup.visitor.name} 
                                        className="scan-popup-photo" 
                                    />
                                </div>
                                <div className="scan-popup-identity-text">
                                    <h2 className="scan-popup-name">{scanPopup.visitor.name}</h2>
                                    <div className="scan-popup-id-row">
                                        <span className="badge-chip">
                                            <i className="fa-solid fa-id-badge" style={{ marginRight: '4px' }}></i>
                                            {scanPopup.visitor.visitorNo || scanPopup.visitor.id}
                                        </span>
                                        <span className={`status-badge ${scanPopup.visitor.status === 'checked-in' ? 'status-in' : 'status-out'}`}>
                                            <i className={`fa-solid ${scanPopup.visitor.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`}></i>
                                            {scanPopup.visitor.status === 'checked-in' ? 'Currently Inside' : 'Checked Out'}
                                        </span>
                                        {isOldVisitor(scanPopup.visitor) ? (
                                            <span className="badge-tag-returning" style={{ padding: '2px 8px', fontSize: '11px' }}>
                                                <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '4px' }}></i> Returning
                                            </span>
                                        ) : (
                                            <span className="badge-tag-new" style={{ padding: '2px 8px', fontSize: '11px' }}>
                                                <i className="fa-solid fa-user-plus" style={{ marginRight: '4px' }}></i> New
                                            </span>
                                        )}
                                    </div>
                                    <div className="scan-popup-subinfo">
                                        {scanPopup.visitor.phone && (
                                            <div>
                                                <i className="fa-solid fa-phone"></i>
                                                <span>{scanPopup.visitor.phone}</span>
                                            </div>
                                        )}
                                        {scanPopup.visitor.company && (
                                            <div>
                                                <i className="fa-solid fa-building"></i>
                                                <span>{scanPopup.visitor.company}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="scan-popup-grid">
                                <div className="scan-detail-item">
                                    <div className="detail-card-icon icon-teal">
                                        <i className="fa-solid fa-clock"></i>
                                    </div>
                                    <div>
                                        <span className="scan-item-label">Check-In Time</span>
                                        <span className="scan-item-val">{formatDateTime(scanPopup.visitor.checkInTime)}</span>
                                    </div>
                                </div>

                                <div className="scan-detail-item">
                                    <div className="detail-card-icon icon-orange">
                                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                    </div>
                                    <div>
                                        <span className="scan-item-label">Check-Out Time</span>
                                        <span className="scan-item-val">
                                            {scanPopup.visitor.checkOutTime ? (
                                                formatDateTime(scanPopup.visitor.checkOutTime)
                                            ) : (
                                                <span style={{ color: '#059669', fontWeight: '700' }}>Active Inside</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div className="scan-detail-item">
                                    <div className="detail-card-icon icon-blue">
                                        <i className="fa-solid fa-user-tie"></i>
                                    </div>
                                    <div>
                                        <span className="scan-item-label">To Meet Person</span>
                                        <span className="scan-item-val" style={{ color: '#1d4ed8' }}>
                                            {scanPopup.visitor.hostName || '-'}
                                        </span>
                                        {scanPopup.visitor.purpose && (
                                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                                {scanPopup.visitor.purpose}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="scan-detail-item">
                                    <div className="detail-card-icon icon-purple">
                                        <i className="fa-solid fa-car"></i>
                                    </div>
                                    <div>
                                        <span className="scan-item-label">Vehicle Details</span>
                                        <span className="scan-item-val" style={{ fontFamily: scanPopup.visitor.vehicleNo && scanPopup.visitor.vehicleNo !== 'No' ? 'monospace' : 'inherit' }}>
                                            {scanPopup.visitor.vehicleNo && scanPopup.visitor.vehicleNo !== 'No' ? scanPopup.visitor.vehicleNo : 'No Vehicle'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Extra Members Group Box if any */}
                            {scanPopup.visitor.hasExtraMembers === 'yes' && (
                                <div className="scan-popup-group-box">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <i className="fa-solid fa-users" style={{ color: '#2563eb' }}></i>
                                        <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>
                                            Accompanying Members ({scanPopup.visitor.extraMembersCount || 1} Persons)
                                        </strong>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#2563eb' }}>
                                        Member IDs: <strong>{scanPopup.visitor.extraMembersIds || 'Included in main pass'}</strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="scan-popup-footer">
                            <button 
                                className="btn btn-secondary btn-sm" 
                                onClick={() => printBadge(scanPopup.visitor)}
                                title="Print Badge"
                            >
                                <i className="fa-solid fa-print"></i>
                                <span>Print Badge</span>
                            </button>
                            {scanPopup.visitor.status === 'checked-in' && (
                                <button 
                                    className="btn btn-outline btn-sm"
                                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                    onClick={() => {
                                        const v = scanPopup.visitor;
                                        setScanPopup(null);
                                        handleCheckout(v.id, v.name);
                                    }}
                                    title="Check Out Visitor"
                                >
                                    <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                    <span>Check Out Now</span>
                                </button>
                            )}
                            <button 
                                className="btn btn-primary btn-sm"
                                onClick={() => setScanPopup(null)}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
