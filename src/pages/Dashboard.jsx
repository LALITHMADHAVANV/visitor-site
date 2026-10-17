import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { useAuth } from '../AuthContext';
import { fetchHosts, saveHost } from '../hosts';
import Badge, { THERMAL_80MM_PAGE_STYLE } from '../components/Badge';
import { getVisitorPhoto } from '../avatarUtils';
import './Dashboard.css';

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const badgeRef = useRef();
    const scanDoneBtnRef = useRef(null);
    const previewDoneBtnRef = useRef(null);
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [previewVisitor, setPreviewVisitor] = useState(null);
    const [scanPopup, setScanPopup] = useState(null); // { visitor, action: 'checkin' | 'checkout' | 'already-checked-out', timestamp }
    const [isEditingVisitor, setIsEditingVisitor] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [hostList, setHostList] = useState([]);
    const scanPopupOpenedAtRef = useRef(0);
    const hasPrintedRef = useRef(false);
    const isPrintingRef = useRef(false);
    const [allVisitors, setAllVisitors] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'inside', 'checked-out'
    const [searchTerm, setSearchTerm] = useState('');

    const handlePrintCompleted = useCallback(() => {
        isPrintingRef.current = false;
        hasPrintedRef.current = true;
        // Direct navigation / focus straight to Done button after print option
        setTimeout(() => {
            scanDoneBtnRef.current?.focus();
        }, 50);
    }, []);

    const handlePrint = useReactToPrint({
        contentRef: badgeRef,
        documentTitle: selectedVisitor ? `Visitor_Badge_${selectedVisitor.id}` : 'Visitor_Badge',
        pageStyle: THERMAL_80MM_PAGE_STYLE,
        onAfterPrint: () => {
            handlePrintCompleted();
        },
    });

    const printBadge = (visitor) => {
        setSelectedVisitor(visitor);
        isPrintingRef.current = true;
        setTimeout(() => handlePrint(), 100);
    };

    const isFetchingRef = useRef(false);

    const fetchDashboardData = useCallback(async () => {
        if (isFetchingRef.current || document.visibilityState === 'hidden') return;
        isFetchingRef.current = true;
        try {
            const visitorsData = await db.visitors.toArray();
            setAllVisitors(visitorsData || []);
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        } finally {
            isFetchingRef.current = false;
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();

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

        // Periodic refresh every 5 seconds for live dashboard (with in-flight guard)
        const interval = setInterval(() => {
            fetchDashboardData();
        }, 5000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('visitor-scan-processed', handleScanProcessed);
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

    const handleCheckInVisitor = async (visitor) => {
        try {
            const checkInTime = new Date().toISOString();
            await db.visitors.update(visitor.id, {
                status: 'checked-in',
                checkInTime
            });
            fetchDashboardData();
            const updated = await db.visitors.get(visitor.id);
            if (updated) {
                setScanPopup({
                    visitor: updated,
                    action: 'checkin',
                    timestamp: checkInTime
                });
            }
        } catch (err) {
            console.error("Check in visitor error:", err);
            alert("Failed to check in visitor.");
        }
    };

    const renderStatusBadge = (status) => {
        if (status === 'checked-in') {
            return (
                <span className="status-badge status-in">
                    <i className="fa-solid fa-circle-check" style={{ fontSize: '9px' }}></i>
                    Inside
                </span>
            );
        }
        if (status === 'checked-out') {
            return (
                <span className="status-badge status-out">
                    <i className="fa-solid fa-arrow-right-from-bracket" style={{ fontSize: '9px' }}></i>
                    Checked Out
                </span>
            );
        }
        if (status === 'registered') {
            return (
                <span className="status-badge status-registered" title="Registered (Awaiting Security Check-In)">
                    <i className="fa-solid fa-id-card" style={{ fontSize: '9px' }}></i>
                    Registered
                </span>
            );
        }
        if (status === 'expected') {
            return (
                <span className="status-badge status-expected" title="Pre-registered / Expected Visitor">
                    <i className="fa-solid fa-calendar-day" style={{ fontSize: '9px' }}></i>
                    Expected
                </span>
            );
        }
        return (
            <span className="status-badge status-out">
                {status || '-'}
            </span>
        );
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
        const handleBeforePrint = () => {
            isPrintingRef.current = true;
        };
        const handleAfterPrint = () => {
            handlePrintCompleted();
        };

        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        window.addEventListener('visitor-print-completed', handlePrintCompleted);

        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
            window.removeEventListener('visitor-print-completed', handlePrintCompleted);
        };
    }, [handlePrintCompleted]);

    // Fetch dynamic host suggestions on mount
    useEffect(() => {
        fetchHosts().then(hosts => {
            if (Array.isArray(hosts)) setHostList(hosts);
        }).catch(() => {});
    }, []);

    const handleStartEdit = () => {
        if (!scanPopup || !scanPopup.visitor) return;
        const v = scanPopup.visitor;
        setEditFormData({
            name: v.name || '',
            phone: v.phone || '',
            company: v.company || '',
            hostName: v.hostName || '',
            purpose: v.purpose || '',
            vehicleNo: v.vehicleNo || '',
            idType: v.idType || 'Aadhar Number',
            idNumber: v.idNumber || '',
            hasExtraMembers: v.hasExtraMembers || 'no',
            extraMembersCount: v.extraMembersCount || 1,
            extraMembersIds: v.extraMembersIds || ''
        });
        setIsEditingVisitor(true);
    };

    const handleSaveEdit = async (e) => {
        if (e) e.preventDefault();
        if (!scanPopup || !scanPopup.visitor) return;
        const v = scanPopup.visitor;
        if (!editFormData.name.trim()) {
            alert('Visitor Name is required.');
            return;
        }

        const updatedFields = {
            name: editFormData.name.trim(),
            phone: editFormData.phone.trim(),
            company: editFormData.company.trim(),
            hostName: editFormData.hostName.trim(),
            purpose: editFormData.purpose.trim(),
            vehicleNo: editFormData.vehicleNo.trim() || 'No',
            idType: editFormData.idType,
            idNumber: editFormData.idNumber.trim(),
            hasExtraMembers: editFormData.hasExtraMembers,
            extraMembersCount: editFormData.hasExtraMembers === 'yes' ? Number(editFormData.extraMembersCount) || 1 : 0,
            extraMembersIds: editFormData.hasExtraMembers === 'yes' ? editFormData.extraMembersIds.trim() : ''
        };

        try {
            await db.visitors.update(v.id, updatedFields);
            if (updatedFields.hostName) {
                saveHost(updatedFields.hostName).catch(() => {});
            }
            const updatedVisitor = await db.visitors.get(v.id);
            const refreshed = updatedVisitor || { ...v, ...updatedFields };
            setScanPopup(prev => prev ? { ...prev, visitor: refreshed } : null);
            setIsEditingVisitor(false);
            fetchDashboardData();
        } catch (err) {
            console.error('Failed to update visitor:', err);
            alert('Failed to save visitor changes.');
        }
    };

    const handleDone = useCallback(() => {
        if (!scanPopup || !scanPopup.visitor) {
            setScanPopup(null);
            setIsEditingVisitor(false);
            return;
        }
        const visitorToPrint = scanPopup.visitor;
        const shouldPrint = scanPopup.action === 'checkin' || visitorToPrint.status === 'checked-in';
        setScanPopup(null);
        setIsEditingVisitor(false);
        if (shouldPrint) {
            printBadge(visitorToPrint);
        }
    }, [scanPopup]);

    useEffect(() => {
        if (!scanPopup) {
            hasPrintedRef.current = false;
            setIsEditingVisitor(false);
            return;
        }
        scanPopupOpenedAtRef.current = Date.now();
        hasPrintedRef.current = false;
        setIsEditingVisitor(false);

        // Direct navigation / focus straight to the Done button immediately
        const timer = setTimeout(() => {
            scanDoneBtnRef.current?.focus();
        }, 50);

        return () => clearTimeout(timer);
    }, [scanPopup]);

    useEffect(() => {
        if (previewVisitor) {
            const timer = setTimeout(() => previewDoneBtnRef.current?.focus(), 50);
            return () => clearTimeout(timer);
        }
    }, [previewVisitor]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (scanPopup) {
                    e.preventDefault();
                    if (isEditingVisitor) {
                        setIsEditingVisitor(false);
                    } else {
                        setScanPopup(null);
                    }
                }
                if (previewVisitor) {
                    e.preventDefault();
                    setPreviewVisitor(null);
                }
            } else if (e.key === 'Enter') {
                // If browser print dialog is actively open, do not intercept
                if (isPrintingRef.current) {
                    return;
                }

                // When scan popup is open:
                if (scanPopup) {
                    if (isEditingVisitor) {
                        return; // Allow typing in input fields without closing popup
                    }
                    // Slight 300ms debounce for trailing barcode scanner enter if not yet printed
                    const elapsed = Date.now() - scanPopupOpenedAtRef.current;
                    if (!hasPrintedRef.current && elapsed < 300) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    handleDone();
                } else if (previewVisitor) {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewVisitor(null);
                }
            }
        };
        // Use capture phase so Enter intercepts cleanly before active inputs or elements
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [scanPopup, previewVisitor, isEditingVisitor, handleDone]);

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
            <div className="glass-panel dashboard-table-card">
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
                        <table className="data-table" style={{ minWidth: '1050px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '3.5%', textAlign: 'center' }}>#</th>
                                    <th style={{ width: '10.5%' }}>Visitor ID</th>
                                    <th style={{ width: '22%' }}>Visitor Details</th>
                                    <th style={{ width: '5.5%', textAlign: 'center' }}>Persons</th>
                                    <th style={{ width: '15%' }}>To Meet</th>
                                    <th style={{ width: '9.5%' }}>Check In</th>
                                    <th style={{ width: '9.5%' }}>Check Out</th>
                                    <th style={{ width: '9%' }}>Status</th>
                                    <th style={{ width: '15.5%', textAlign: 'right', paddingRight: '14px' }}>Actions</th>
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
                                                <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '11px' }}>
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
                                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                                            <div 
                                                                style={{ fontWeight: '600', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}
                                                                onClick={() => setPreviewVisitor(v)}
                                                                title="Touch / click to view visitor details"
                                                            >
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                                                                {isOldVisitor(v) ? (
                                                                    <span className="badge-tag-returning" title="Returning visitor (visited previously)">Old</span>
                                                                ) : (
                                                                    <span className="badge-tag-new" title="First-time visitor">New</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {v.company && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.company}</span>}
                                                                {v.phone && <span style={{ whiteSpace: 'nowrap' }}>• {v.phone}</span>}
                                                            </div>
                                                            {extraCount > 0 && (
                                                                <div style={{ fontSize: '10.5px', color: '#2563eb', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
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
                                                             borderRadius: '3px', 
                                                             fontWeight: '600',
                                                             display: 'inline-block',
                                                             marginTop: '2px',
                                                             whiteSpace: 'nowrap'
                                                         }}>
                                                             1+{extraCount}
                                                         </span>
                                                     ) : (
                                                         <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Single</span>
                                                     )}
                                                </td>
                                                <td style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.hostName}>{v.hostName}</div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.purpose || 'Visit'}>{v.purpose || 'Visit'}</div>
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: '600', fontSize: '11.5px', whiteSpace: 'nowrap' }}>{formatTime(v.checkInTime)}</div>
                                                </td>                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {v.checkOutTime ? (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                                                            {formatTime(v.checkOutTime)}
                                                        </div>
                                                    ) : v.status === 'checked-in' ? (
                                                        <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {renderStatusBadge(v.status)}
                                                </td>
                                                <td style={{ textAlign: 'right', paddingRight: '14px' }}>
                                                    <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                                                         {v.status === 'registered' && (
                                                             <button 
                                                                 className="btn btn-primary btn-sm"
                                                                 onClick={() => handleCheckInVisitor(v)}
                                                                 title="Check In Visitor"
                                                                 style={{ padding: '2px 8px', fontSize: '10.5px', whiteSpace: 'nowrap', background: '#0284c7', borderColor: '#0284c7' }}
                                                             >
                                                                 <i className="fa-solid fa-arrow-right-to-bracket" style={{ fontSize: '9.5px', marginRight: '3px' }}></i>
                                                                 <span>Check In</span>
                                                             </button>
                                                         )}
                                                         {v.status === 'checked-in' && (
                                                             <button 
                                                                 className="btn btn-outline btn-sm"
                                                                 onClick={() => handleCheckout(v.id, v.name)}
                                                                 title="Check Out Visitor"
                                                                 style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '2px 6px', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                                                             >
                                                                 <i className="fa-solid fa-arrow-right-from-bracket" style={{ fontSize: '9.5px' }}></i>
                                                                 <span>Out</span>
                                                             </button>
                                                         )}
                                                         <button 
                                                             className="btn btn-secondary btn-icon" 
                                                             onClick={() => printBadge(v)} 
                                                             title="Print Gate Pass / Badge"
                                                             style={{ padding: '3px 6px', fontSize: '11px' }}
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
                                                            {v.checkOutTime ? formatTime(v.checkOutTime) : v.status === 'checked-in' ? <span style={{ color: 'var(--success)', fontWeight: '500' }}>Active</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {renderStatusBadge(v.status)}
                                                    </td>
                                                    <td style={{ textAlign: 'right', paddingRight: '14px' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
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
                                    <div style={{ marginTop: '8px' }}>
                                        {renderStatusBadge(previewVisitor.status)}
                                    </div>
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
                                ref={previewDoneBtnRef}
                                className="btn btn-primary btn-sm"
                                onClick={() => setPreviewVisitor(null)}
                                title="Done (Enter / Esc to close)"
                                autoFocus
                            >
                                <i className="fa-solid fa-check" style={{ marginRight: '5px' }}></i>
                                <span>Done</span>
                                <span style={{ 
                                    marginLeft: '6px', 
                                    fontSize: '10px', 
                                    background: 'rgba(255,255,255,0.25)', 
                                    padding: '1px 5px', 
                                    borderRadius: '3px',
                                    fontWeight: '600'
                                }}>↵ Enter</span>
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
                            {isEditingVisitor ? (
                                <form className="scan-popup-edit-form" onSubmit={handleSaveEdit}>
                                    <div className="scan-edit-header">
                                        <i className="fa-solid fa-user-pen"></i>
                                        <span>Edit Visitor Details</span>
                                    </div>
                                    <div className="scan-edit-grid">
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">Full Name *</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                value={editFormData.name || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                                placeholder="Visitor Name"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">Phone Number</label>
                                            <input 
                                                type="tel" 
                                                className="scan-edit-input" 
                                                value={editFormData.phone || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                                                placeholder="Phone Number"
                                            />
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">Company / Org</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                value={editFormData.company || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                                                placeholder="Company Name"
                                            />
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">To Meet (Host)</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                list="scan-hosts-list"
                                                value={editFormData.hostName || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, hostName: e.target.value })}
                                                placeholder="Host Name"
                                            />
                                            <datalist id="scan-hosts-list">
                                                {hostList.map((h, idx) => (
                                                    <option key={idx} value={typeof h === 'string' ? h : (h?.name || '')} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">Purpose</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                value={editFormData.purpose || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, purpose: e.target.value })}
                                                placeholder="Purpose of Visit"
                                            />
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">Vehicle Details</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                value={editFormData.vehicleNo || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, vehicleNo: e.target.value })}
                                                placeholder="e.g. MH12AB1234 or No"
                                            />
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">ID Proof Type</label>
                                            <select 
                                                className="scan-edit-select"
                                                value={editFormData.idType || 'Aadhar Number'}
                                                onChange={(e) => setEditFormData({ ...editFormData, idType: e.target.value })}
                                            >
                                                <option value="Aadhar Number">Aadhar Number</option>
                                                <option value="PAN Number">PAN Number</option>
                                                <option value="Passport">Passport</option>
                                                <option value="Voter ID">Voter ID</option>
                                                <option value="Driving License">Driving License</option>
                                                <option value="Other ID">Other ID</option>
                                            </select>
                                        </div>
                                        <div className="scan-edit-group">
                                            <label className="scan-edit-label">ID Number</label>
                                            <input 
                                                type="text" 
                                                className="scan-edit-input" 
                                                value={editFormData.idNumber || ''} 
                                                onChange={(e) => setEditFormData({ ...editFormData, idNumber: e.target.value })}
                                                placeholder="ID Proof Number"
                                            />
                                        </div>
                                    </div>

                                    {/* Extra Members Section */}
                                    <div className="scan-edit-extragroup">
                                        <label className="scan-edit-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                                            <input 
                                                type="checkbox" 
                                                checked={editFormData.hasExtraMembers === 'yes'}
                                                onChange={(e) => setEditFormData({ ...editFormData, hasExtraMembers: e.target.checked ? 'yes' : 'no' })}
                                            />
                                            <span>Accompanying / Extra Members</span>
                                        </label>
                                        {editFormData.hasExtraMembers === 'yes' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px', marginTop: '10px' }}>
                                                <div>
                                                    <label className="scan-edit-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Count</label>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        className="scan-edit-input" 
                                                        value={editFormData.extraMembersCount || 1}
                                                        onChange={(e) => setEditFormData({ ...editFormData, extraMembersCount: e.target.value })}
                                                        placeholder="Count"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="scan-edit-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Member IDs / Names</label>
                                                    <input 
                                                        type="text" 
                                                        className="scan-edit-input" 
                                                        value={editFormData.extraMembersIds || ''}
                                                        onChange={(e) => setEditFormData({ ...editFormData, extraMembersIds: e.target.value })}
                                                        placeholder="e.g. ID-1234, ID-1235"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </form>
                            ) : (
                                <>
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
                                                {renderStatusBadge(scanPopup.visitor.status)}
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

                                        <div className="scan-detail-item">
                                            <div className="detail-card-icon icon-teal">
                                                <i className="fa-solid fa-id-card"></i>
                                            </div>
                                            <div>
                                                <span className="scan-item-label">ID Proof ({scanPopup.visitor.idType || 'ID'})</span>
                                                <span className="scan-item-val" style={{ fontFamily: 'monospace' }}>
                                                    {scanPopup.visitor.idNumber || 'Not Provided'}
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
                                </>
                            )}
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="scan-popup-footer">
                            {isEditingVisitor ? (
                                <>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary btn-sm" 
                                        onClick={() => setIsEditingVisitor(false)}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                        <span>Cancel</span>
                                    </button>
                                    <button 
                                        type="button"
                                        className="btn btn-primary btn-sm" 
                                        onClick={handleSaveEdit}
                                        style={{ background: '#059669', borderColor: '#059669' }}
                                    >
                                        <i className="fa-solid fa-floppy-disk"></i>
                                        <span>Save Changes</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary btn-sm" 
                                        onClick={handleStartEdit}
                                        title="Edit Visitor Details"
                                        style={{ marginRight: 'auto' }}
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i>
                                        <span>Edit</span>
                                    </button>
                                    {scanPopup.visitor.status === 'checked-in' && scanPopup.action !== 'checkin' && (
                                        <button 
                                            type="button"
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
                                            <span>Check Out</span>
                                        </button>
                                    )}
                                    <button 
                                        ref={scanDoneBtnRef}
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleDone}
                                        autoFocus
                                        title={scanPopup.action === 'checkin' || scanPopup.visitor.status === 'checked-in' ? "Done & Automatically Print Badge" : "Done (Close)"}
                                        id="scan-popup-done-btn"
                                    >
                                        <i className={scanPopup.action === 'checkin' || scanPopup.visitor.status === 'checked-in' ? "fa-solid fa-print" : "fa-solid fa-check"} style={{ marginRight: '5px' }}></i>
                                        <span>{scanPopup.action === 'checkin' || scanPopup.visitor.status === 'checked-in' ? "Done" : "Done"}</span>
                                        <span style={{ 
                                            marginLeft: '6px', 
                                            fontSize: '10px', 
                                            background: 'rgba(255,255,255,0.25)', 
                                            padding: '1px 5px', 
                                            borderRadius: '3px',
                                            fontWeight: '600'
                                        }}>↵ Enter</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
