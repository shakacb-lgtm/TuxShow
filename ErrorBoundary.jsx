import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Plugin UI Render Error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-2 bg-red-900/30 border border-red-800 rounded text-red-200">
          <h3 className="font-bold text-lg mb-1 flex items-center space-x-2">
            <span>⚠️</span> <span>Plugin UI Error</span>
          </h3>
          <p className="text-sm mb-3">This third-party panel encountered a fatal rendering error and has been disabled to protect show stability.</p>
          <pre className="text-xs p-2 bg-black/40 rounded overflow-x-auto text-red-300 opacity-80">{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}