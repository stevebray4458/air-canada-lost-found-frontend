import express from 'express';
import { auth } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

interface DeliveryInfo {
    receiverName?: string;
    deliveryDate?: string;
}

interface Item {
    flightNumber: string;
    dateFound: string;
    category?: string;
    location: string;
    description: string;
    deliveryInfo?: DeliveryInfo;
}

type ReportType = 'delivered' | 'inHand';

interface GenerateReportRequest {
    reportType: ReportType;
    items: Item[];
}

const router = express.Router();
const prisma = new PrismaClient();

// Route to generate report data
router.post('/generate', auth, async (req, res) => {
    try {
        const { reportType, items }: GenerateReportRequest = req.body;
        
        if (!reportType || !items || !Array.isArray(items)) {
            return res.status(400).json({ 
                error: 'Invalid request data. reportType and items array are required.' 
            });
        }

        // Here we just send back the data that will be used by the frontend to generate the PDF
        res.json({
            success: true,
            data: {
                reportType,
                items,
                generatedAt: new Date().toISOString(),
                metadata: {
                    totalItems: items.length,
                    reportType: reportType === 'delivered' ? 'Artículos Entregados' : 'Artículos En Mano'
                }
            }
        });
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al generar el reporte' 
        });
    }
});

export default router;
