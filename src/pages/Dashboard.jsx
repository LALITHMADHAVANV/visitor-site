import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import Badge, { THERMAL_80MM_PAGE_STYLE } from '../components/Badge';
import './Dashboard.css';

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const badgeRef = useRef();
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [previewVisitor, setPreviewVisitor] = useState(null);
    const [allVisitors, setAllVisitors] = useState([]);
    const [preregisteredList, setPreregisteredList] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'inside', 'checked-out', 'expected'
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('today'); // 'today', 'yesterday', 'week', 'all'

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
            const [visitorsData, preregData] = await Promise.all([
                db.visitors.toArray(),
                db.preregistered.toArray()
            ]);
            setAllVisitors(visitorsData || []);
            setPreregisteredList(preregData || []);
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
                .on('postgres_changes', { event: '*', schema: 'public', table: 'preregistered' }, () => {
                    fetchDashboardData();
                })
                .subscribe();
        } catch (e) {
            console.error("Realtime subscription error on dashboard:", e);
        }

        // Real-time updates from hardware barcode/QR scanner
        window.addEventListener('visitor-scan-processed', fetchDashboardData);

        // Periodic refresh every 3 seconds for live dashboard
        const interval = setInterval(fetchDashboardData, 3000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('visitor-scan-processed', fetchDashboardData);
            if (channel) supabase.removeChannel(channel);
        };
    }, [fetchDashboardData]);

    // Get date range boundaries
    const getDateBounds = useCallback((range) => {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);

        switch (range) {
            case 'today':
                return { start: startOfToday, end: endOfToday };
            case 'yesterday': {
                const startYesterday = new Date(startOfToday);
                startYesterday.setDate(startYesterday.getDate() - 1);
                return { start: startYesterday, end: startOfToday };
            }
            case 'week': {
                const startWeek = new Date(startOfToday);
                startWeek.setDate(startWeek.getDate() - 7);
                return { start: startWeek, end: endOfToday };
            }
            case 'all':
            default:
                return { start: new Date(0), end: endOfToday };
        }
    }, []);

    // Visitors filtered by date range
    const dateFilteredVisitors = useMemo(() => {
        const { start, end } = getDateBounds(dateRange);
        return allVisitors.filter(v => {
            const time = v.checkInTime || v.created_at;
            if (!time) return false;
            const d = new Date(time);
            return d >= start && d < end;
        });
    }, [allVisitors, dateRange, getDateBounds]);

    const insideVisitors = useMemo(() => {
        return dateFilteredVisitors.filter(v => v.status === 'checked-in');
    }, [dateFilteredVisitors]);

    const checkedOutVisitors = useMemo(() => {
        return dateFilteredVisitors.filter(v => v.status === 'checked-out');
    }, [dateFilteredVisitors]);

    const expectedToday = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return preregisteredList.filter(p => {
            if (!p.expectedDate) return false;
            const pDate = new Date(p.expectedDate);
            return pDate >= today && pDate < tomorrow && p.status === 'expected';
        });
    }, [preregisteredList]);

    const handleCheckout = async (id, name) => {
        if (window.confirm(`Check out ${name || 'visitor'} now?`)) {
            await db.visitors.update(id, {
                status: 'checked-out',
                checkOutTime: new Date().toISOString()
            });
            fetchDashboardData();
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
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const dateRangeLabel = dateRange === 'today' ? 'Today' : dateRange === 'yesterday' ? 'Yesterday' : dateRange === 'week' ? 'This Week' : 'All Time';

    // Filtered visitors according to search & active tab
    const filteredVisitors = useMemo(() => {
        let baseList = dateFilteredVisitors;

        if (statusFilter === 'inside') {
            baseList = baseList.filter(v => v.status === 'checked-in');
        } else if (statusFilter === 'checked-out') {
            baseList = baseList.filter(v => v.status === 'checked-out');
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
    }, [dateFilteredVisitors, statusFilter, searchTerm]);

    return (
        <section className="dashboard-page">
            {/* Date Range Selector */}
            <div className="date-range-bar">
                <div className="date-range-pills">
                    {[
                        { key: 'today', label: 'Today', icon: 'fa-solid fa-calendar-day' },
                        { key: 'yesterday', label: 'Yesterday', icon: 'fa-solid fa-calendar-minus' },
                        { key: 'week', label: 'Last 7 Days', icon: 'fa-solid fa-calendar-week' },
                        { key: 'all', label: 'All Time', icon: 'fa-solid fa-calendar' },
                    ].map(opt => (
                        <button
                            key={opt.key}
                            className={`date-pill ${dateRange === opt.key ? 'active' : ''}`}
                            onClick={() => { setDateRange(opt.key); setStatusFilter('all'); }}
                        >
                            <i className={opt.icon}></i>
                            <span>{opt.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Stat Cards */}
            <div className="stats-grid">
                <div 
                    className={`stat-card stat-total ${statusFilter === 'all' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter('all')}
                    role="button"
                    title={`Click to view all visitors — ${dateRangeLabel}`}
                >
                    <div className="stat-icon icon-blue">
                        <i className="fa-solid fa-users"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total — {dateRangeLabel}</span>
                        <h2 className="stat-value">{dateFilteredVisitors.length}</h2>
                        <span className="stat-subtext">Registered visitors</span>
                    </div>
                </div>

                <div 
                    className={`stat-card stat-inside ${statusFilter === 'inside' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter('inside')}
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

                <div 
                    className={`stat-card stat-expected ${statusFilter === 'expected' ? 'active-filter' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'expected' ? 'all' : 'expected')}
                    role="button"
                    title="Click to view expected guests"
                >
                    <div className="stat-icon icon-amber">
                        <i className="fa-regular fa-clock"></i>
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Expected Today</span>
                        <h2 className="stat-value text-warning">{expectedToday.length}</h2>
                        <span className="stat-subtext">Pre-registered guests</span>
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
                                All ({dateRangeLabel}) <span className="pill-count">{dateFilteredVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'inside' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('inside')}
                            >
                                Currently Inside <span className="pill-count count-green">{insideVisitors.length}</span>
                            </button>
                            <button 
                                className={`pill-btn ${statusFilter === 'checked-out' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('checked-out')}
                            >
                                Checked Out <span className="pill-count">{checkedOutVisitors.length}</span>
                            </button>
                            {expectedToday.length > 0 && (
                                <button 
                                    className={`pill-btn ${statusFilter === 'expected' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('expected')}
                                >
                                    Expected <span className="pill-count count-amber">{expectedToday.length}</span>
                                </button>
                            )}
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
                {statusFilter === 'expected' ? (
                    /* Show Expected Visitors */
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px', textAlign: 'center' }}>S.No</th>
                                    <th>Guest Name</th>
                                    <th>Company</th>
                                    <th>Person to Visit (Host)</th>
                                    <th>Expected Date</th>
                                    <th>Purpose</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expectedToday.length === 0 ? (
                                    <tr>
                                        <td colSpan="7">
                                            <div className="empty-state">
                                                <i className="fa-regular fa-calendar-xmark empty-state-icon"></i>
                                                <p>No expected visitors scheduled for today.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    expectedToday.map((p, index) => (
                                        <tr key={p.id}>
                                            <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                {index + 1}
                                            </td>
                                            <td>
                                                <strong>{p.name}</strong>
                                            </td>
                                            <td>{p.company || '-'}</td>
                                            <td>
                                                <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{p.hostName}</span>
                                            </td>
                                            <td>{new Date(p.expectedDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                            <td>{p.purpose || '-'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button 
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => navigate('/register', { state: { preregData: p } })}
                                                >
                                                    <i className="fa-solid fa-check"></i> Check In
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Show Normal Visitors Table */
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
                                                            {v.photoData ? (
                                                                <img src={v.photoData} className="avatar-sm" alt={v.name} />
                                                            ) : (
                                                                <div className="avatar-placeholder">
                                                                    {v.name ? v.name.charAt(0).toUpperCase() : 'V'}
                                                                </div>
                                                            )}
                                                            <div className="avatar-zoom-hint">
                                                                <i className="fa-solid fa-magnifying-glass-plus"></i>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div 
                                                                style={{ fontWeight: '600', color: 'var(--text-primary)', cursor: 'pointer' }}
                                                                onClick={() => setPreviewVisitor(v)}
                                                                title="Touch / click to view visitor details"
                                                            >
                                                                {v.name}
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
                )}
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
                                    {previewVisitor.photoData ? (
                                        <img 
                                            src={previewVisitor.photoData} 
                                            alt={previewVisitor.name} 
                                            className="visitor-modal-photo"
                                        />
                                    ) : (
                                        <div className="visitor-modal-photo-placeholder">
                                            {previewVisitor.name ? previewVisitor.name.charAt(0).toUpperCase() : 'V'}
                                        </div>
                                    )}
                                    <span className={`status-badge ${previewVisitor.status === 'checked-in' ? 'status-in' : 'status-out'}`} style={{ marginTop: '8px', fontSize: '11px' }}>
                                        <i className={`fa-solid ${previewVisitor.status === 'checked-in' ? 'fa-circle-check' : 'fa-arrow-right-from-bracket'}`}></i>
                                        {previewVisitor.status === 'checked-in' ? 'Currently Inside' : 'Checked Out'}
                                    </span>
                                </div>

                                <div className="visitor-modal-identity-info">
                                    <h2 className="visitor-modal-name">{previewVisitor.name}</h2>
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
        </section>
    );
}
