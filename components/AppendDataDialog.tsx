import React, { useState, useRef, useEffect } from 'react';
import { ICONS } from '../constants';
import { api } from '../services/api';
import { Select } from './Select';

interface ApiOption {
  label: string;
  value: string;
}

interface AppendDataDialogProps {
  onClose: () => void;
  onImport: (data: any) => void;
  targetTableId: string;
  targetTableName: string;
  existingMetadataValues: { metadata_id: string; metadata_value: string }[];
}

const AppendDataDialog: React.FC<AppendDataDialogProps> = ({
  onClose,
  onImport,
  targetTableId,
  targetTableName,
  existingMetadataValues,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tabs, setTabs] = useState<ApiOption[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  
  const [databaseOptions, setDatabaseOptions] = useState<ApiOption[]>([]);
  const [databaseTableOptions, setDatabaseTableOptions] = useState<ApiOption[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedDatabaseTable, setSelectedDatabaseTable] = useState<string>('');

  const [dataMartOptions, setDataMartOptions] = useState<ApiOption[]>([]);
  const [dataModelOptions, setDataModelOptions] = useState<ApiOption[]>([]);
  const [selectedDataMart, setSelectedDataMart] = useState<string>('');
  const [selectedDataModel, setSelectedDataModel] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTabs = async () => {
      try {
        const res = await api.getDataSourceOptions();
        if (res.data && res.data.length > 0) {
          setTabs(res.data);
          setActiveTab(res.data[0].value);
        }
      } catch (error) {
        console.error('Failed to fetch data source options', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTabs();
  }, []);

  useEffect(() => {
    if (activeTab === 'database' && databaseOptions.length === 0) {
      api.getDatabaseOptions().then(res => setDatabaseOptions(res.data || [])).catch(console.error);
    } else if (activeTab === 'data_model' && dataMartOptions.length === 0) {
      api.getDataMartOptions().then(res => setDataMartOptions(res.data || [])).catch(console.error);
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedDatabase) {
      api.getDatabaseTableOptions(selectedDatabase).then(res => setDatabaseTableOptions(res.data || [])).catch(console.error);
      setSelectedDatabaseTable('');
    } else {
      setDatabaseTableOptions([]);
    }
  }, [selectedDatabase]);

  useEffect(() => {
    if (selectedDataMart) {
      api.getDataModelOptions(selectedDataMart).then(res => setDataModelOptions(res.data || [])).catch(console.error);
      setSelectedDataModel('');
    } else {
      setDataModelOptions([]);
    }
  }, [selectedDataMart]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
    }
  };

  const processFile = () => {
    const payload: any = {
      dataSource: activeTab,
      appendToTable: true,
      targetTableId: targetTableId,
      metadataValues: existingMetadataValues,
    };

    if (activeTab === 'offline_data') {
      if (!file) return;
      payload.file = file;
    } else if (activeTab === 'database') {
      payload.databaseId = selectedDatabase;
      payload.tableName = selectedDatabaseTable;
    } else if (activeTab === 'data_model') {
      payload.datamarkId = selectedDataMart;
      payload.dataModelId = selectedDataModel;
    }

    onImport(payload);
  };

  const isSubmitDisabled = () => {
    if (activeTab === 'offline_data') return !file;
    if (activeTab === 'database') return !selectedDatabase || !selectedDatabaseTable;
    if (activeTab === 'data_model') return !selectedDataMart || !selectedDataModel;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            追加导入数据
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">✕</button>
        </div>

        {isLoading ? (
          <div className="p-10 flex justify-center items-center">
            <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">目标多维表格:</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800">
                {targetTableName}
              </div>
            </div>

            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                {tabs.map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`
                      whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                      ${activeTab === tab.value 
                        ? 'border-primary-500 text-primary-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
            
            <div className="min-h-[200px]">
              {activeTab === 'database' && (
                <div className="space-y-4 animate-in fade-in">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1"><span className="text-red-500 mr-1">*</span>数据库名:</label>
                    <Select 
                      value={selectedDatabase}
                      onChange={(value) => setSelectedDatabase(value)}
                      options={databaseOptions}
                      placeholder="请选择"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1"><span className="text-red-500 mr-1">*</span>数据库表:</label>
                    <Select 
                      value={selectedDatabaseTable}
                      onChange={(value) => setSelectedDatabaseTable(value)}
                      disabled={!selectedDatabase}
                      options={databaseTableOptions}
                      placeholder="请选择"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'data_model' && (
                <div className="space-y-4 animate-in fade-in">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1"><span className="text-red-500 mr-1">*</span>数据集市:</label>
                    <Select 
                      value={selectedDataMart}
                      onChange={(value) => setSelectedDataMart(value)}
                      options={dataMartOptions}
                      placeholder="请选择"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1"><span className="text-red-500 mr-1">*</span>数据模型:</label>
                    <Select 
                      value={selectedDataModel}
                      onChange={(value) => setSelectedDataModel(value)}
                      disabled={!selectedDataMart}
                      options={dataModelOptions}
                      placeholder="请选择"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'offline_data' && (
                <div className="animate-in fade-in">
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50
                      ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-400 hover:bg-gray-100'}
                      ${file ? 'bg-blue-50 border-blue-300' : ''}
                    `}
                  >
                    <input 
                       type="file" 
                       ref={fileInputRef} 
                       onChange={handleFileChange} 
                       className="hidden" 
                       accept=".xlsx, .xls, .csv" 
                    />
                    
                    {file ? (
                      <div className="text-center">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                          <ICONS.Import />
                        </div>
                        <p className="text-sm font-medium text-blue-800 truncate max-w-[200px]">{file.name}</p>
                        <p className="text-xs text-blue-600 mt-1">点击更换文件</p>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <div className="w-12 h-12 bg-blue-500 text-white rounded-lg flex items-center justify-center mx-auto mb-3 shadow-sm">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <p className="text-sm font-medium">点击或将文档拖拽到此处上传</p>
                        <p className="text-xs text-gray-400 mt-1">格式支持 .xlsx、.xls、.csv格式</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-gray-100 bg-white rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 text-sm text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors">取消</button>
          <button 
            onClick={processFile}
            disabled={isSubmitDisabled() || isLoading}
            className="px-6 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppendDataDialog;
