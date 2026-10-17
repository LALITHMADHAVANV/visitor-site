import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../db';
import * as XLSX from 'xlsx';
import { useAuth } from '../AuthContext';
import { getVisitorPhoto } from '../avatarUtils';

export default function Visitors() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [visitors, setVisitors] = useState([]);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const { user } = useAuth();
    const isFetchingRef = useRef(false);

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            if (isFetchingRef.current || document.visibilityState === 'hidden') return;
            isFetchingRef.current = true;
            try {
                const data = await db.visitors.toArray();
                if (isMounted) {
                    setVisitors(data || []);
                }
            } catch (err) {
                console.error("Error loading visitors:", err);
            } finally {
                isFetchingRef.current = false;
            }
        };

        load();
        const interval = setInterval(() => {
            load();
        }, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
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

            // From Date to To Date Range Filter
            let matchesDate = true;
            if (fromDate || toDate) {
                const time = v.checkInTime || v.created_at;
                if (!time) {
                    matchesDate = false;
                } else {
                    const d = new Date(time);
                    if (isNaN(d.getTime())) {
                        matchesDate = false;
                    } else {
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const vDate = `${year}-${month}-${day}`;

                        if (fromDate && vDate < fromDate) matchesDate = false;
                        if (toDate && vDate > toDate) matchesDate = false;
                    }
                }
            }

            return matchesSearch && matchesStatus && matchesDate;
        }).sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
    }, [visitors, searchTerm, filterStatus, fromDate, toDate]);

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
            'Status': v.status === 'checked-in' ? 'Inside' : (v.status === 'registered' ? 'Registered' : (v.status === 'expected' ? 'Expected' : 'Checked Out')),
            'Check-In Time': v.checkInTime ? new Date(v.checkInTime).toLocaleString() : '-',
            'Check-Out Time': v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Visitors");

        const dateRangeLabel = fromDate ? `${fromDate}_to_${toDate || 'latest'}` : (toDate ? `upto_${toDate}` : new Date().toISOString().split('T')[0]);
        XLSX.writeFile(workbook, `Esstee_Visitors_Report_${dateRangeLabel}.xlsx`);
    };

    const exportToPDF = async () => {
        if (user?.role !== 'admin') return;
        setIsExportingPdf(true);
        try {
            const { jsPDF } = await import('jspdf');
            const autoTable = (await import('jspdf-autotable')).default;

            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'pt',
                format: 'a4'
            });

            // Company Title and Header
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59); // slate-800
            doc.text('ESSTEE EXPORTS - VISITOR HISTORY REPORT', 40, 36);

            // Subtitle & Filter summary
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139); // slate-500
            
            const filterParts = [];
            if (fromDate && toDate) {
                filterParts.push(`Date Range: ${fromDate} to ${toDate}`);
            } else if (fromDate) {
                filterParts.push(`From Date: ${fromDate}`);
            } else if (toDate) {
                filterParts.push(`To Date: ${toDate}`);
            } else {
                filterParts.push(`Date: All Time`);
            }
            if (filterStatus !== 'all') {
                filterParts.push(`Status: ${filterStatus === 'checked-in' ? 'Inside' : filterStatus}`);
            }
            if (searchTerm.trim()) {
                filterParts.push(`Search: "${searchTerm.trim()}"`);
            }
            filterParts.push(`Records: ${filteredVisitors.length}`);
            filterParts.push(`Exported: ${new Date().toLocaleString()}`);

            doc.text(filterParts.join('   |   '), 40, 52);

            // Table headers and body
            const tableHeaders = [
                ['#', 'Visitor ID', 'Visitor Name', 'Company', 'Persons', 'Phone', 'ID Proof', 'To Meet', 'Vehicle', 'Check-In', 'Check-Out', 'Status']
            ];

            const tableRows = filteredVisitors.map((v, index) => {
                const extraCount = v.hasExtraMembers === 'yes' ? (parseInt(v.extraMembersCount, 10) || 0) : 0;
                const totalPersons = 1 + extraCount;
                
                let idProof = '-';
                if (v.idType || v.idNumber) {
                    idProof = `${v.idType || ''} ${v.idNumber ? '(' + v.idNumber + ')' : ''}`.trim();
                }

                let statusText = 'Checked Out';
                if (v.status === 'checked-in') statusText = 'Inside';
                else if (v.status === 'registered') statusText = 'Registered';
                else if (v.status === 'expected') statusText = 'Expected';

                const inTime = v.checkInTime ? new Date(v.checkInTime).toLocaleString([], {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '-';

                const outTime = v.checkOutTime ? new Date(v.checkOutTime).toLocaleString([], {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : (v.status === 'checked-in' ? 'Active Inside' : '-');

                return [
                    index + 1,
                    v.visitorNo || v.id,
                    v.name || '-',
                    v.company || '-',
                    totalPersons > 1 ? `${totalPersons} (1+${extraCount})` : '1',
                    v.phone || '-',
                    idProof,
                    v.hostName || '-',
                    v.vehicleNo || 'No',
                    inTime,
                    outTime,
                    statusText
                ];
            });

            autoTable(doc, {
                startY: 64,
                head: tableHeaders,
                body: tableRows,
                theme: 'striped',
                styles: {
                    fontSize: 8,
                    cellPadding: 4.5,
                    overflow: 'linebreak',
                    textColor: [30, 41, 59],
                    valign: 'middle'
                },
                headStyles: {
                    fillColor: [37, 99, 235], // royal blue #2563eb
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5,
                    halign: 'left'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252] // slate-50
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 24 }, // #
                    1: { cellWidth: 72, fontStyle: 'bold' }, // Visitor ID
                    2: { cellWidth: 80, fontStyle: 'bold' }, // Name
                    3: { cellWidth: 72 }, // Company
                    4: { halign: 'center', cellWidth: 38 }, // Persons
                    5: { cellWidth: 62 }, // Phone
                    6: { cellWidth: 80 }, // ID Proof
                    7: { cellWidth: 74 }, // To Meet
                    8: { cellWidth: 48 }, // Vehicle
                    9: { cellWidth: 75 }, // Check-In
                    10: { cellWidth: 75 }, // Check-Out
                    11: { halign: 'center', cellWidth: 55 } // Status
                },
                didDrawPage: (data) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(
                        `Page ${data.pageNumber} of ${pageCount}  •  Esstee Exports Visitor Management System`,
                        doc.internal.pageSize.getWidth() / 2,
                        doc.internal.pageSize.getHeight() - 15,
                        { align: 'center' }
                    );
                }
            });

            const dateRangeLabel = fromDate ? `${fromDate}_to_${toDate || 'latest'}` : (toDate ? `upto_${toDate}` : new Date().toISOString().split('T')[0]);
            doc.save(`Esstee_Visitors_Report_${dateRangeLabel}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            alert('Failed to generate PDF report: ' + error.message);
        } finally {
            setIsExportingPdf(false);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatDate = (isoString) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleDateString([], {
            month: 'short', day: 'numeric'
        });
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

    const hasActiveFilters = searchTerm !== '' || filterStatus !== 'all' || fromDate !== '' || toDate !== '';

    const resetFilters = () => {
        setSearchTerm('');
        setFilterStatus('all');
        setFromDate('');
        setToDate('');
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
                    <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Search Input */}
                        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
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
                                padding: '8px 12px',
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
                            <option value="registered">Registered (Pending)</option>
                        </select>

                        {/* From Date Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '2px 8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>From</span>
                            <input
                                id="filter-from-date"
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                title="Filter from date"
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '6px 4px',
                                    fontSize: '12.5px',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>

                        {/* To Date Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '2px 8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>To</span>
                            <input
                                id="filter-to-date"
                                type="date"
                                value={toDate}
                                min={fromDate || undefined}
                                onChange={(e) => setToDate(e.target.value)}
                                title="Filter up to date"
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '6px 4px',
                                    fontSize: '12.5px',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>

                        {hasActiveFilters && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={resetFilters}
                                title="Reset all filters"
                                style={{ padding: '7px 12px', fontSize: '12px' }}
                            >
                                <i className="fa-solid fa-arrow-rotate-left"></i> Reset
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                            {filteredVisitors.length} {filteredVisitors.length === 1 ? 'record' : 'records'}
                        </span>

                        {user?.role === 'admin' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={exportToPDF}
                                    disabled={isExportingPdf}
                                    title="Export filtered records as PDF document"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <i className={isExportingPdf ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-file-pdf"} style={{ color: '#dc2626' }}></i>
                                    <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={exportToExcel}
                                    title="Export to Excel Spreadsheet"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <i className="fa-solid fa-file-excel" style={{ color: '#059669' }}></i>
                                    <span>Export Excel</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Data Table */}
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                                <th style={{ width: '9%' }}>Visitor ID</th>
                                <th style={{ width: '17%' }}>Visitor</th>
                                <th style={{ width: '5%', textAlign: 'center' }}>Persons</th>
                                <th style={{ width: '9%' }}>Phone</th>
                                <th style={{ width: '10%' }}>ID Proof</th>
                                <th style={{ width: '14%' }}>To Meet</th>
                                <th style={{ width: '7.5%' }}>Vehicle</th>
                                <th style={{ width: '9%' }}>Check-In</th>
                                <th style={{ width: '9%' }}>Check-Out</th>
                                <th style={{ width: '7.5%' }}>Status</th>
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
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '11px' }}>
                                                    {index + 1}
                                                </td>
                                                <td>
                                                    <span className="badge-id" style={{ fontFamily: 'monospace', fontSize: '10.5px', fontWeight: '700' }}>
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
                                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                                            <strong style={{ color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{v.name}</strong>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {v.company || '-'}
                                                            </span>
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
                                                        fontSize: totalPersons > 1 ? '13px' : '12px',
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
                                                            marginTop: '2px',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            1+{extraCount}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Single</span>
                                                    )}
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{v.phone || '-'}</span>
                                                </td>
                                                <td style={{ overflow: 'hidden' }}>
                                                    {v.idType ? (
                                                        <div>
                                                            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '600', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {v.idType}
                                                            </span>
                                                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#475569', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {v.idNumber || '-'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.hostName}>{v.hostName}</div>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.purpose || '-'}>
                                                        {v.purpose || '-'}
                                                    </span>
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <span style={{ fontSize: '11px', color: v.vehicleNo && v.vehicleNo !== 'No' ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {v.vehicleNo || 'No'}
                                                    </span>
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <div style={{ lineHeight: '1.25' }}>
                                                        <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', whiteSpace: 'nowrap' }}>
                                                            {formatTime(v.checkInTime)}
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap' }}>
                                                            {formatDate(v.checkInTime)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {v.checkOutTime ? (
                                                        <div style={{ lineHeight: '1.25' }}>
                                                            <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', whiteSpace: 'nowrap' }}>
                                                                {formatTime(v.checkOutTime)}
                                                            </span>
                                                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap' }}>
                                                                {formatDate(v.checkOutTime)}
                                                            </span>
                                                        </div>
                                                    ) : v.status === 'checked-in' ? (
                                                        <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            Active Inside
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {renderStatusBadge(v.status)}
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
                                                        <div style={{ lineHeight: '1.25' }}>
                                                            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>
                                                                {formatTime(v.checkInTime)}
                                                            </span>
                                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                                {formatDate(v.checkInTime)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {v.checkOutTime ? (
                                                            <div style={{ lineHeight: '1.25' }}>
                                                                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>
                                                                    {formatTime(v.checkOutTime)}
                                                                </span>
                                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                                    {formatDate(v.checkOutTime)}
                                                                </span>
                                                            </div>
                                                        ) : v.status === 'checked-in' ? (
                                                            <span style={{ color: 'var(--success)', fontSize: '11px' }}>
                                                                Active Inside
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                                                -
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {renderStatusBadge(v.status)}
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
