
import { GoogleGenAI } from "@google/genai";
import { Column, Row, FieldType } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const generateSmartFormula = async (prompt: string, columns: Column[]) => {
  const columnContext = columns.map(c => `${c.name} (${c.type})`).join(", ");
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `作为一名专家级电子表格工程师，请帮助用户编写公式。
    可用列：${columnContext}。
    用户需求：${prompt}。
    仅返回公式字符串（例如："{单价} * {数量}"）。不要添加任何解释说明。`,
  });
  return response.text.trim();
};

export const generateFieldOptions = async (fieldName: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `用户正在创建一个名为"${fieldName}"的单选或多选字段。
    请根据字段名称生成 5-10 个合理的选项值。
    仅返回选项列表，用逗号分隔，不要包含任何其他文字或编号。
    例如：如果字段名是"优先级"，返回"最高, 高, 中, 低, 最低"。`,
  });
  const text = response.text || "";
  return text.split(/[,，、\n]/).map(s => s.trim()).filter(s => s && s.length > 0);
};

export const analyzeTableData = async (tableData: { columns: Column[], rows: Row[] }) => {
  const simplifiedRows = tableData.rows.map(r => r.data);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请分析以下表格数据并以要点形式提供 3 条关键见解或趋势发现。
    列信息：${JSON.stringify(tableData.columns.map(c => c.name))}
    数据内容：${JSON.stringify(simplifiedRows)}
    请保持回答简洁、专业且使用中文。`,
  });
  return response.text;
};
