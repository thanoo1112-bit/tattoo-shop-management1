'use client';

import React from 'react';

interface PortfolioFilterProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  filters?: string[];
}

export default function PortfolioFilter({ activeFilter, onFilterChange, filters }: PortfolioFilterProps) {
  const defaultFilters = [
    'All',
    'Fine Line',
    'Blackwork',
    'Japanese',
    'Traditional',
    'Minimal',
    'Realism',
  ];

  const filterList = filters || defaultFilters;

  return (
    <div className="flex overflow-x-auto pb-2 scrollbar-none gap-2 px-1 max-w-full justify-start md:justify-center font-prompt">
      {filterList.map((filter) => {
        const isActive = activeFilter === filter;
        return (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={`whitespace-nowrap px-3.5 py-2 text-xs uppercase tracking-wider transition-all duration-200 rounded-[4px] border ${
              isActive
                ? 'bg-studio-red text-studio-paper border-studio-red font-semibold'
                : 'bg-studio-card text-studio-secondary border-studio-border hover:border-studio-red/60 hover:text-studio-primary'
            }`}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}
