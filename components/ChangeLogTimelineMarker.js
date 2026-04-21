import React from 'react';

const ChangeLogTimelineMarker = ({ type }) => {
  if (type === 'major') {
    return (
      <div className="absolute left-6 top-[18px] w-2 h-2 bg-primary rounded-full ring-2 ring-primary/30 ring-offset-2 ring-offset-background -translate-x-1/2"></div>
    );
  }
  return (
    <div className="absolute left-6 top-[18px] w-2 h-2 bg-primary rounded-full -translate-x-1/2"></div>
  );
};

export default ChangeLogTimelineMarker;
