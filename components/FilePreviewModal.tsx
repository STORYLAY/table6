import React, { useEffect, useRef, useState } from 'react';
import { ICONS } from '../constants';
import { Tooltip } from './Tooltip';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';

interface FilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileBlob: Blob | null;
    filename: string;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ isOpen, onClose, fileBlob, filename }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [textContent, setTextContent] = useState<string>('');
    const [excelHtml, setExcelHtml] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [objectUrl, setObjectUrl] = useState<string>('');

    useEffect(() => {
        if (!isOpen || !fileBlob) return;
        
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        setError('');
        setTextContent('');
        setExcelHtml('');
        
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }

        const url = URL.createObjectURL(fileBlob);
        setObjectUrl(url);

        const renderFile = async () => {
            try {
                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
                    // Handled by img tag
                } else if (ext === 'pdf') {
                    // Handled by iframe
                } else if (['txt', 'json', 'md', 'csv'].includes(ext)) {
                    const text = await fileBlob.text();
                    setTextContent(text);
                } else if (ext === 'docx') {
                    if (containerRef.current) {
                        await renderAsync(fileBlob, containerRef.current, null, {
                            className: 'docx-preview-container',
                            inWrapper: false,
                            ignoreWidth: false,
                            ignoreHeight: false,
                            ignoreFonts: false,
                            breakPages: true,
                            ignoreLastRenderedPageBreak: true,
                            experimental: true,
                            trimXmlDeclaration: true,
                            debug: false,
                            useBase64URL: true
                        });
                    }
                } else if (['xlsx', 'xls'].includes(ext)) {
                    const arrayBuffer = await fileBlob.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const html = XLSX.utils.sheet_to_html(worksheet, { id: 'excel-table' });
                    setExcelHtml(html);
                } else {
                    setError('暂不支持纯前端预览该类型的文件，请下载后查看');
                }
            } catch (err) {
                console.error(err);
                setError('文件解析失败，可能文件已损坏或格式不兼容');
            }
        };

        renderFile();

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [isOpen, fileBlob, filename]);

    if (!isOpen || !fileBlob) return null;

    const ext = filename.split('.').pop()?.toLowerCase() || '';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 md:p-8" onClick={onClose}>
            <div 
                className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <ICONS.File className="w-5 h-5 text-primary-500 shrink-0" />
                        <Tooltip content={filename}>
                            <h3 className="text-sm font-medium text-gray-800 truncate pr-4">{filename}</h3>
                        </Tooltip>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                        <ICONS.Close className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto bg-gray-100 relative flex items-center justify-center">
                    {error ? (
                        <div className="text-gray-500 flex flex-col items-center p-8 text-center">
                            <ICONS.File className="w-12 h-12 mb-4 text-gray-400" />
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            {['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) && (
                                <img src={objectUrl} alt={filename} className="max-w-full max-h-full object-contain shadow-sm" />
                            )}
                            {ext === 'pdf' && (
                                <iframe src={objectUrl} className="w-full h-full border-0 shadow-sm bg-white" title={filename} />
                            )}
                            {['txt', 'json', 'md', 'csv'].includes(ext) && (
                                <div className="w-full h-full bg-white p-6 overflow-auto shadow-sm">
                                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                                        {textContent}
                                    </pre>
                                </div>
                            )}
                            {ext === 'docx' && (
                                <div ref={containerRef} className="w-full h-full overflow-auto bg-gray-100 flex justify-center" />
                            )}
                            {['xlsx', 'xls'].includes(ext) && (
                                <div 
                                    className="w-full h-full bg-white p-4 overflow-auto shadow-sm excel-preview-container"
                                    dangerouslySetInnerHTML={{ __html: excelHtml }}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
