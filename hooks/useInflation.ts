
import { useState, useEffect } from 'react';

export const useInflation = () => {
    const [inflationRate, setInflationRate] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchInflation = async () => {
            try {
                // Fetch last 12 months of IPCA (Series 433)
                const response = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json');
                const data = await response.json();

                // Calculate average monthly inflation
                if (data && data.length > 0) {
                    const total = data.reduce((acc: number, item: any) => acc + parseFloat(item.valor), 0);
                    const average = total / data.length;
                    setInflationRate(average / 100); // Convert percentage to decimal (0.5% -> 0.005)
                }
            } catch (error) {
                console.error('Error fetching inflation data:', error);
                // Fallback to a conservative estimate if API fails (e.g., 0.4% per month)
                setInflationRate(0.004);
            } finally {
                setLoading(false);
            }
        };

        fetchInflation();
    }, []);

    return { inflationRate, loading };
};
