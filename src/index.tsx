import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Select, Input, Button, Space, message, Avatar, Switch } from 'antd';
import { CloseOutlined, UploadOutlined } from '@ant-design/icons';

import qrcode from 'qrcode';
import { bitable, IField, ITable, IRecord, FieldType, IUserField, IOpenUser, IAttachmentField, ITextField } from '@lark-base-open/js-sdk';

const { Option } = Select;
const { TextArea } = Input;

const App = () => {
  // 定义表格信息接口
  interface TableInfo {
    id: string;
    name: string;
    table: ITable;
  }

  // 添加表格选择相关状态
  const [tablesList, setTablesList] = useState<TableInfo[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // 移除旧表格选择状态，添加当前表格和字段选择状态
  const [currentTable, setCurrentTable] = useState<ITable | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [employeeState, setEmployeeState] = useState<{
    field: IField | null;
    list: Employee[];
    selectedId: string | undefined;
  }>({
    field: null,
    list: [],
    selectedId: ''
  });
  const [qrcodeContent, setQrcodeContent] = useState('');
  interface Employee {
    id: string;
    name: string;
    avatarUrl?: string;
  }

  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [showQrcode, setShowQrcode] = useState(false);
  // 新增本地图片选择状态
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [attachmentState, setAttachmentState] = useState<{
    field: IField | null;
    list: any[];
    selectedId: string | undefined;
  }>({
    field: null,
    list: [],
    selectedId: ''
  });
  const [overwriteAttachment, setOverwriteAttachment] = useState(true);
  // 获取当前活动表格和所有表格列表
  useEffect(() => {
    const getTablesInfo = async () => {
      try {
        setIsLoading(true);
        const base = bitable.base;
        // 获取所有表格并提取名称
        const tables = await base.getTableList();
        const tableInfos = await Promise.all(
          tables.map(async (table) => ({
            id: table.id,
            name: await table.getName(),
            table: table
          }))
        );
        setTablesList(tableInfos);
        
        // 获取当前活动表格
        const activeTable = await base.getActiveTable();
        if (activeTable) {
          setCurrentTable(activeTable);
          setSelectedTableId(activeTable.id);
          console.log('当前活动表格:', activeTable.id);
        }
      } catch (error) {
        console.error('获取表格信息失败:', error);
        message.error('获取表格信息失败');
      } finally {
        setIsLoading(false);
      }
    };

    getTablesInfo();
  }, []);

  // 获取表格中人员类型字段并加载人员数据
  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!currentTable) return;
      try {
        setIsLoading(true);
        // 获取所有字段
        const fields = await currentTable.getFieldList();
        console.log('所有字段数量:', fields.length);

        // 获取所有字段的类型、名称和头像信息
        const fieldsWithInfo = await Promise.all(
          fields.map(async (field) => {
            const type = await field.getType();
            const name = await field.getName();
            return {
              id: field.id,
              field,
              type,
              name
            };
          })
        );

        // 筛选类型为人员类型(11)的字段
        const employeeFieldItems = fieldsWithInfo.filter(
          item => item.type === FieldType.User
        );

        // 筛选类型为附件类型的字段
        const attachmentFieldItems = fieldsWithInfo.filter(
          item => item.type === FieldType.Attachment
        );

        if (employeeFieldItems.length === 0) {
          message.warning('未找到人员类型字段');
          setEmployeeState(prev => ({ ...prev, field: null, list: [] }));
        } else {
          // 设置第一个人员字段为当前选中字段
          const targetField = employeeFieldItems[0];
          setEmployeeState(prev => ({ ...prev, list: employeeFieldItems, field: targetField.field, selectedId: targetField.id }));
        }

        if (attachmentFieldItems.length > 0) {
          const targetAttachmentField = attachmentFieldItems[0];
          setAttachmentState(prev => ({ ...prev, list: attachmentFieldItems, field: targetAttachmentField.field, selectedId: targetAttachmentField.id }));
        } else {
          setAttachmentState(prev => ({ ...prev, field: null, list: [] }));
          message.warning('未找到附件类型字段');
        }
        return;
      } catch (error) {
        console.error('获取人员数据失败:', error);
        message.error('获取人员数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployeeData();
  }, [currentTable]);

  // 生成二维码
  const handleGenerateQrcode = async () => {
    if (!employeeState.selectedId) {
      message.warning('请选择人员字段');
      return;
    }

    if (!attachmentState.selectedId) {
      message.warning('请选择附件字段');
      return;
    }

    if (!qrcodeContent) {
      message.warning('请输入分享的表单链接');
      return;
    }

    // 判断是否是飞书表单链接
    const feishuFormRegex = /^https:\/\/[\w-]+\.feishu\.cn\/share\/base\/form(\/.*)?$/;
    const feishuUri = feishuFormRegex.test(qrcodeContent)
    if (!feishuUri) {
      message.warning('当前不是飞书表单链接, 会正常生成二维码但不会添加人员信息');
    }

    // 检查数据
    if (!currentTable || !employeeState.field || !attachmentState.field) {
      message.warning('发生了一点点小意外，导致数据加载失败，建议重新加载插件');
      return;
    }

    setIsLoading(true);
    setShowQrcode(true);

    // 将二维码保存到附件字段
    try {
      const recordIdList = await currentTable.getRecordIdList();
      if (recordIdList.length === 0) {
        message.warning('当前表格暂无记录，请添加记录后重试');
        return;
      }
      const records = await Promise.all(recordIdList.map(async (recordId) => {
        return { recordId, record: (await currentTable.getRecordById(recordId))};
      }));
        
      const validRecords = records.filter((pair) => {
        const employeeExist = pair.record.fields[employeeState.field!.id] != null
        if (overwriteAttachment) {
          return employeeExist
        }
        return pair.record.fields[attachmentState.field!.id] == null && employeeExist
      })
      if (validRecords.length === 0) {
        message.warning('当前表格暂无有效数据，请添加记录后重试');
        return;
      }

      message.info(`检测到有效数据${validRecords.length}条`)

      let successIndex = 1
      for (const pair of validRecords) {
        const recordId = pair.recordId
        const record = pair.record
        const employee = record.fields[employeeState.field!.id] as IOpenUser[]
        console.info('employee', employee)
        let url: string;
        try {
          // 直接生成二维码数据URL（去除白边）
          let qrcodeResult = qrcodeContent
          if (feishuUri) {
            // 添加默认参数 prefill_邀请人=当前人员
            const url = new URL(qrcodeContent);
            const params = url.searchParams;

            // 添加参数
            params.append('prefill_邀请人', employee[0].name || '');

            // 更新链接
            url.search = params.toString();
            qrcodeResult = url.toString();
          }
          url = await qrcode.toDataURL(qrcodeResult, { errorCorrectionLevel: 'H', width: 200, margin: 0 });
          
          // 添加中心图标
          const iconUrl = '/favicon.svg'; // Vite环境下直接使用public目录资源
          url = await addCenterIconToQrcode(url, iconUrl); // 修复函数名拼写错误
          setQrcodeUrl(url);
        } catch (error) {
          message.error('二维码生成失败');
          console.error('生成二维码失败:', error);
          return;
        }
        setQrcodeUrl(url);

        // 新增图片合并逻辑
        let mergedImageUrl = url;
        if (selectedImage && imagePreviewUrl) {
          try {
            mergedImageUrl = await mergeImages(imagePreviewUrl, url);
            setQrcodeUrl(mergedImageUrl);
          } catch (mergeError) {
            console.error('图片合并失败:', mergeError);
            message.error('图片合并失败，将仅保存二维码');
          }
        }

        // 将二维码保存到附件字段
        try {
          // 将 data URL 转换为 File 对象
          // 使用合并后的图片URL创建文件
          const response = await fetch(mergedImageUrl);
          const blob = await response.blob();
          const file = new File([blob], `poster_${Date.now()}.png`, { type: 'image/png' });

          await attachmentState.field.setValue(recordId, file);
          message.success(`第${successIndex++}条海报生成并保存成功`);
        } catch (saveError) {
          console.error('保存海报到附件失败:', saveError);
          message.error('海报生成成功，但保存到附件失败');
        }
      }
    } catch (error) {
      console.error('生成海报失败:', error);
      message.error('生成海报失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 新增：添加中心图标到二维码
  const addCenterIconToQrcode = async (qrCodeUrl: string, iconUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('无法获取Canvas上下文');
        return;
      }

      const qrImg = new Image();
      const iconImg = new Image();

      qrImg.crossOrigin = 'anonymous';
      iconImg.crossOrigin = 'anonymous';

      let imagesLoaded = 0;
      const checkLoaded = () => {
        imagesLoaded++;
        if (imagesLoaded === 2) {
          canvas.width = qrImg.width;
          canvas.height = qrImg.height;

          // 绘制二维码
          ctx.drawImage(qrImg, 0, 0);

          // 计算图标尺寸（二维码的1/4大小）
          const iconSize = Math.min(qrImg.width, qrImg.height) / 4;
          const x = (qrImg.width - iconSize) / 2;
          const y = (qrImg.height - iconSize) / 2;

          // 绘制中心图标
          ctx.drawImage(iconImg, x, y, iconSize, iconSize);

          // 绘制白色圆角背景
          const bgSize = iconSize * 1.1;
          const bgX = (qrImg.width - bgSize) / 2;
          const bgY = (qrImg.height - bgSize) / 2;
          const borderRadius = 8;

          ctx.fillStyle = 'white';
          ctx.roundRect(bgX, bgY, bgSize, bgSize, borderRadius);
          ctx.fill();

          // 绘制图标
          ctx.drawImage(iconImg, x, y, iconSize, iconSize);
          resolve(canvas.toDataURL('image/png'));
        }
      };

      qrImg.onload = checkLoaded;
      iconImg.onload = checkLoaded;
      qrImg.onerror = () => reject('二维码加载失败');
      iconImg.onerror = () => reject('图标加载失败');

      qrImg.src = qrCodeUrl;
      iconImg.src = iconUrl;
    });
  };

  // 修复图片合并函数作用域 - 移至App组件内部
  const mergeImages = async (backgroundUrl: string, qrCodeUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('无法获取Canvas上下文');
        return;
      }

      const backgroundImg = new Image();
      const qrCodeImg = new Image();

      backgroundImg.crossOrigin = 'anonymous';
      qrCodeImg.crossOrigin = 'anonymous';

      let imagesLoaded = 0;

      const checkLoaded = () => {
        imagesLoaded++;
        if (imagesLoaded === 2) {
          // 设置Canvas尺寸为背景图片尺寸
          canvas.width = backgroundImg.width;
          canvas.height = backgroundImg.height;

          // 绘制背景图片
          ctx.drawImage(backgroundImg, 0, 0);

          // 计算二维码尺寸（背景图片宽度的30%）
          const qrSize = Math.min(backgroundImg.width, backgroundImg.height) * 0.3;
          // 二维码位置（底部居中，距离底部20px）
          const marginBottom = 20;
          const x = (backgroundImg.width - qrSize) / 2;
          const y = backgroundImg.height - qrSize - marginBottom;

          // 绘制二维码
          ctx.drawImage(qrCodeImg, x, y, qrSize, qrSize);

          // 转换为data URL
          resolve(canvas.toDataURL('image/png'));
        }
      };

      backgroundImg.onload = checkLoaded;
      qrCodeImg.onload = checkLoaded;

      backgroundImg.onerror = () => reject('背景图片加载失败');
      qrCodeImg.onerror = () => reject('二维码图片加载失败');

      backgroundImg.src = backgroundUrl;
      qrCodeImg.src = qrCodeUrl;
    });
  };

  return (
    <div style={{ padding: '30px', maxWidth: '550px', margin: '0 auto', background: 'linear-gradient(135deg, #f5f7fa 0%, #e4eaf5 100%)', minHeight: '100vh' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <h2 style={{ textAlign: 'center', fontSize: '24px', color: '#1890ff', marginBottom: '10px', fontWeight: '600' }}>海报生成器</h2>

        {/* 调试信息显示 */}
        {/* {process.env.NODE_ENV !== 'production' && (
          <div style={{ fontSize: '12px', color: '#666', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <p>调试信息: 人员数量={employeeState.list.length}, 是否加载中={isLoading}, 当前选中={employeeState.selectedId}</p>
          </div>
        )} */}

        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-block', fontSize: '12px', color: '#666', padding: '8px 16px', backgroundColor: '#f5f7fa', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: 0, fontWeight: 500 }}>江苏诺飞软件技术有限公司</p>
          </div>
        </div>

        {/* 表单区域 */}
        <div style={{ padding: '28px', border: 'none', borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,0.05)', backgroundColor: 'white', transition: 'all 0.3s ease' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* 表格选择 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}>
                <span style={{ color: '#ff4d4f' }}> * </span>请选择表格
              </label>
              <Select<string>
                style={{ width: '100%', borderRadius: '8px' }}
                size="middle"
                value={selectedTableId}
                onChange={async (value) => {
                  setSelectedTableId(value);
                  try {
                    setIsLoading(true);
                    // 从缓存的表格信息中查找
                    const tableInfo = tablesList.find(item => item.id === value);
                    if (tableInfo) {
                      setCurrentTable(tableInfo.table);
                    } else {
                      // 未找到时 fallback 到直接获取
                      const table = await bitable.base.getTableById(value);
                      setCurrentTable(table);
                    }
                  } catch (error) {
                    console.error('切换表格失败:', error);
                    message.error('切换表格失败');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={!tablesList.length || isLoading}
                placeholder="请选择表格"
              >
                {tablesList.map((tableInfo) => (
                  <Option key={tableInfo.id} value={tableInfo.id}>{tableInfo.name}</Option>
                ))}
              </Select>
            </div>

            {/* 人员选择 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}>
                <span style={{ color: '#ff4d4f' }}> * </span>请选择人员字段
              </label>
              <Select<string, { label: string; value: string; avatarUrl?: string }> 
                style={{ width: '100%', borderRadius: '8px' }}
                size="middle"
                value={employeeState.selectedId}
                onChange={(value) => setEmployeeState(prev => ({ ...prev, selectedId: value }))}
                showSearch
                filterOption={(inputValue: string, option: { label?: string } | undefined): boolean =>
                  Boolean(option?.label?.toLowerCase().includes(inputValue.toLowerCase()))
            }
                disabled={!employeeState.list.length || isLoading}
                placeholder="请选择人员字段"
              >
                {employeeState.list.map((employee: Employee) => (
                  <Option key={employee.id} value={employee.id}>
                    <Space>
                      {/* {employee.avatarUrl && (
                        <Avatar size={24} src={employee.avatarUrl} />
                      )} */}
                      <span>{employee.name}</span>
                    </Space>
                  </Option>
                ))}
              </Select>
              {!employeeState.list.length && !isLoading && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#ff4d4f' }}>
                  没有找到可用的人员数据，请检查表格中是否有记录
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
                二维码信息中记录人员信息
              </div>
            </div>

            {/* 附件字段选择 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}><span style={{ color: '#ff4d4f' }}> * </span>请选择附件字段</label>
              <Select<string>
                style={{ width: '100%' }}
                value={attachmentState.selectedId}
                onChange={(value) => setAttachmentState(prev => ({ ...prev, selectedId: value }))}
                disabled={!attachmentState.list.length || isLoading}
                placeholder="请选择附件字段"
              >
                {attachmentState.list.map((item) => (
                  <Option key={item.id} value={item.id}>{item.name}</Option>
                ))}
              </Select>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                海报内容保存位置
              </div>
            </div>

            {/* 二维码内容输入 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}><span style={{ color: '#ff4d4f' }}> * </span>请输入分享的表单链接</label>
              <Input
                placeholder="表单链接（会自动添加邀请人，且允许自带默认值）"
                value={qrcodeContent}
                onChange={e => setQrcodeContent(e.target.value)}
                onPressEnter={handleGenerateQrcode}
                style={{ borderRadius: '8px' }}
                size="middle"
              />
            </div>

            {/* 覆写附件开关 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}><span style={{ color: '#ff4d4f' }}> * </span>覆写海报</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Switch
                  checked={overwriteAttachment}
                  onChange={setOverwriteAttachment}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                />
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                开启后将只处理没有海报的人员
              </div>
            </div>

            {/* 选择海报背景图片 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333', fontSize: '14px' }}>选择海报背景图片</label>
              <div style={{ position: 'relative' }}>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImage(file);
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setImagePreviewUrl(event.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="file-upload"
                />
                <label htmlFor="file-upload"
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    textAlign: 'center',
                    padding: '12px 0',
                    border: '1px dashed #d9d9d9',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#1890ff';
                    e.currentTarget.style.backgroundColor = '#f0f7ff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#d9d9d9';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Space>
                    <UploadOutlined style={{ fontSize: '16px', color: '#666' }} />
                    <span style={{ color: '#666' }}>点击上传或拖拽文件至此处</span>
                  </Space>
                </label>
              </div>
              {imagePreviewUrl && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <img
                    src={imagePreviewUrl}
                    alt="预览"
                    style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '4px' }}
                  />
                </div>
              )}
            </div>

            {/* 生成按钮 */}
            <Button
              type="primary"
              onClick={handleGenerateQrcode}
              loading={isLoading}
              shape="round"
              size="large"
              style={{ width: '100%', height: '48px', fontSize: '16px', background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', border: 'none', boxShadow: '0 4px 12px rgba(24, 144, 255, 0.2)', transition: 'all 0.2s ease' }}
            >
              生成海报
            </Button>

            {/* 二维码显示区域 */}
            {showQrcode && (
              <div style={{ marginTop: '20px', textAlign: 'center', padding: '20px', border: '1px solid #f0f0f0', borderRadius: '10px', backgroundColor: '#fafafa', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                <p style={{ marginBottom: '12px', color: '#666' }}>生成的海报</p>
                {qrcodeUrl && (
                  <img
                    src={qrcodeUrl}
                    alt="预览"
                    onClick={() => {
                      setPreviewImageUrl(qrcodeUrl);
                      setIsPreviewOpen(true);
                    }}
                    style={{
                      maxWidth: '200px',
                      cursor: 'pointer',
                      marginTop: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                  />
                )}
                {qrcodeUrl && <p style={{ marginTop: '12px', color: '#52c41a' }}>海报已生成</p>}
              </div>
            )}
          </Space>
        </div>
      </Space>

      {/* 图片预览模态框 */}
      {isPreviewOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
            backdropFilter: 'blur(5px)',
            transition: 'opacity 0.3s ease',
            opacity: 1
          }}
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
              animation: 'fadeIn 0.3s ease'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="大图预览"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
              onClick={() => setIsPreviewOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);