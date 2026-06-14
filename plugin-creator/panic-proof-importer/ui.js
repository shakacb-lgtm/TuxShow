/**
 * "Panic-Proof" Slide Importer Plugin
 * TuxShow FOSS Utility Plugin
 * Automatically parses PDF files, renders pages to PNG Data URLs,
 * and populates the cue stack.
 */

if (window.tuxShowRegistry && window.tuxShowRegistry.registerInspectorTab) {
  const React = window.React;
  const h = React.createElement;

  // Helper function to load PDF.js library dynamically from CDN
  const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.id = 'pdfjs-lib-cdn';
      script.onload = () => {
        // Set the workerSrc immediately upon loading the main library
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = (err) => {
        console.error('[Slide Importer] Failed to load PDF.js from CDN', err);
        reject(new Error('Failed to download slide parser library from CDN. Verify internet connection.'));
      };
      document.head.appendChild(script);
    });
  };

  const SlideImporterComponent = ({ activeCue, cues, setCues, selectedCueIds, updateSelectedCues }) => {
    const [status, setStatus] = React.useState('idle'); // idle, loading, parsing, success, error
    const [progress, setProgress] = React.useState(0);
    const [progressText, setProgressText] = React.useState('');
    const [errorMessage, setErrorMessage] = React.useState('');
    const [dragOver, setDragOver] = React.useState(false);
    const [importSummary, setImportSummary] = React.useState({ count: 0, fileName: '' });

    const fileInputRef = React.useRef(null);

    const handleDragOver = (e) => {
      e.preventDefault();
      setDragOver(true);
    };

    const handleDragLeave = () => {
      setDragOver(false);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
      }
    };

    const handleFileSelect = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processFile(e.target.files[0]);
      }
    };

    const processFile = async (file) => {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      const isPptx = file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt');

      if (isPptx) {
        setStatus('error');
        setErrorMessage('TuxShow runs locally on Linux stage computers. To guarantee your slide layouts, custom fonts, and vector elements look identical to the presenter\'s laptop, please save the PowerPoint deck as a PDF first and drop the PDF here. This avoids formatting errors on stage!');
        return;
      }

      if (!isPdf) {
        setStatus('error');
        setErrorMessage('Unsupported file format. Please drop a PDF file.');
        return;
      }

      setStatus('loading');
      setProgressText('Loading slide parser engine...');
      setProgress(5);

      try {
        const pdfjs = await loadPdfJs();
        setStatus('parsing');
        setProgressText('Reading document structure...');
        setProgress(15);

        const reader = new FileReader();
        reader.onload = async function () {
          try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjs.getDocument(typedarray).promise;
            const totalPages = pdf.numPages;

            if (totalPages === 0) {
              throw new Error('This PDF has 0 pages.');
            }

            const newCuesList = [];

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
              setProgressText(`Rendering page ${pageNum} of ${totalPages}...`);
              setProgress(Math.round(15 + (pageNum / totalPages) * 80));

              const page = await pdf.getPage(pageNum);
              
              // We render at 1.5x scale to get high-quality text and image clarity (roughly 1440p-1080p resolution)
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise;

              const dataUrl = canvas.toDataURL('image/png');

              // Extract text content from this page for the cue details
              let textContent = '';
              try {
                const textItems = await page.getTextContent();
                textContent = textItems.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
              } catch (textErr) {
                console.warn(`Failed to extract text for page ${pageNum}`, textErr);
              }

              // Determine descriptive name
              let name = `Slide ${pageNum}`;
              if (textContent.length > 0) {
                const summary = textContent.substring(0, 32).trim();
                name = `Slide ${pageNum}: ${summary}${textContent.length > 32 ? '...' : ''}`;
              }

              // Create default image cue properties matching TuxShow requirements
              const cueId = `slide-${Date.now()}-${pageNum}`;
              newCuesList.push({
                id: cueId,
                number: '', // Will be re-indexed during insertion
                type: 'image',
                name: name,
                description: textContent || `Imported Slide Page ${pageNum}`,
                url: dataUrl,
                state: 'stopped',
                loop: false,
                triggerBehavior: 'stop-others',
                fadeTargetCue: '',
                followAction: 'none',
                fadeInTime: 0.5,
                fadeOutTime: 0.5,
                duration: 0,
                volume: 1,
                targetDisplay: 'all',
                groupId: null,
                scaleX: 100,
                scaleY: 100,
                keepAspect: true,
                posX: 50,
                posY: 50,
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
                outlineEnabled: false,
                outlineColor: '#ffffff',
                outlineWidth: 2,
                warpEnabled: false,
                warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
                mediaSyncOffset: 0,
                colorFilterEnabled: false,
                hue: 0,
                saturation: 100,
                brightness: 100
              });
            }

            setProgressText('Integrating slides into TuxShow cue stack...');
            setProgress(98);

            // Splicing the new cues into the stack
            setCues(prev => {
              let insertIdx = prev.length;
              let groupId = null;

              // If a cue is selected, insert after it and inherit its folder/group
              if (activeCue) {
                const activeIdx = prev.findIndex(c => c.id === activeCue.id);
                if (activeIdx !== -1) {
                  insertIdx = activeIdx + 1;
                  groupId = activeCue.type === 'group' ? activeCue.id : activeCue.groupId;
                }
              }

              const startingNum = prev.length;
              const renumberedCues = newCuesList.map((c, i) => ({
                ...c,
                number: (startingNum + i + 1).toString(),
                groupId: groupId
              }));

              const updatedCues = [...prev];
              updatedCues.splice(insertIdx, 0, ...renumberedCues);
              return updatedCues;
            });

            setImportSummary({ count: totalPages, fileName: file.name });
            setStatus('success');
            setProgress(100);
          } catch (e) {
            console.error(e);
            setStatus('error');
            setErrorMessage(`Failed to process PDF file: ${e.message}`);
          }
        };

        reader.onerror = () => {
          setStatus('error');
          setErrorMessage('FileReader failed to read the file buffer.');
        };

        reader.readAsArrayBuffer(file);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.message || 'Error occurred during parsing.');
      }
    };

    // --- RENDER STATES ---

    if (status === 'idle') {
      return h('div', { className: 'space-y-3' },
        h('div', {
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
          onClick: () => fileInputRef.current && fileInputRef.current.click(),
          className: `border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 ${
            dragOver 
              ? 'border-purple-500 bg-purple-950/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]Scale' 
              : 'border-gray-800 hover:border-gray-700 bg-gray-950/40 hover:bg-gray-950/60'
          }`
        },
          h('input', {
            type: 'file',
            ref: fileInputRef,
            onChange: handleFileSelect,
            accept: '.pdf,.pptx,.ppt',
            className: 'hidden'
          }),
          // Upload Icon
          h('svg', {
            className: 'mx-auto h-8 w-8 text-purple-400 mb-2 opacity-80',
            fill: 'none',
            stroke: 'currentColor',
            viewBox: '0 0 24 24'
          },
            h('path', {
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeWidth: 2,
              d: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
            })
          ),
          h('p', { className: 'text-[11px] font-semibold text-gray-200' }, 'Drop PDF slides file here'),
          h('p', { className: 'text-[9px] text-gray-500 mt-1' }, 'or click to browse local files')
        ),
        // Tip Panel
        h('div', { className: 'bg-indigo-950/25 border border-indigo-900/50 rounded-lg p-3 text-[10px] text-indigo-300 leading-relaxed' },
          h('strong', { className: 'text-indigo-200 block mb-0.5' }, '💡 Pro Show-Control Tip'),
          'To guarantee presentation slides preserve their exact fonts, layouts, and spacing on the booth computer, export PowerPoint/Google Slides to PDF first. This ensures perfect, panic-proof stage graphics.'
        )
      );
    }

    if (status === 'loading' || status === 'parsing') {
      return h('div', { className: 'p-3 space-y-3 bg-gray-950/40 rounded border border-gray-800' },
        h('div', { className: 'flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider' },
          h('span', {}, progressText),
          h('span', { className: 'font-mono text-purple-400' }, `${progress}%`)
        ),
        h('div', { className: 'w-full h-1.5 bg-gray-900 rounded-full overflow-hidden' },
          h('div', {
            className: 'h-full bg-purple-600 rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_rgba(168,85,247,0.4)]',
            style: { width: `${progress}%` }
          })
        ),
        h('p', { className: 'text-[9px] text-gray-500 italic text-center' }, 'Converting vector slides to raster cue layers...')
      );
    }

    if (status === 'success') {
      return h('div', { className: 'p-3 space-y-3 bg-emerald-950/25 border border-emerald-900/50 rounded-lg' },
        h('div', { className: 'flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider' },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2.5, d: 'M5 13l4 4L19 7' })
          ),
          h('span', {}, 'Import Complete')
        ),
        h('div', { className: 'text-[10px] text-gray-400 leading-relaxed' },
          h('span', { className: 'text-gray-200 font-semibold block' }, importSummary.fileName),
          `Successfully converted and populated ${importSummary.count} slides into sequential image cues.`
        ),
        h('button', {
          onClick: () => setStatus('idle'),
          className: 'w-full px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-800/40 border border-emerald-800 rounded text-[10px] uppercase font-bold tracking-wider text-emerald-200 transition-colors'
        }, 'Import Another PDF')
      );
    }

    if (status === 'error') {
      return h('div', { className: 'p-3 space-y-3 bg-red-950/20 border border-red-900/40 rounded-lg' },
        h('div', { className: 'flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider' },
          h('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' })
          ),
          h('span', {}, 'Import Failed')
        ),
        h('div', { className: 'text-[10px] text-gray-400 leading-relaxed max-h-[120px] overflow-y-auto custom-scrollbar' },
          errorMessage
        ),
        h('div', { className: 'flex gap-2' },
          h('button', {
            onClick: () => setStatus('idle'),
            className: 'flex-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[10px] uppercase font-bold tracking-wider text-gray-200 transition-colors'
          }, 'Back'),
          h('button', {
            onClick: () => {
              if (fileInputRef.current) fileInputRef.current.click();
            },
            className: 'flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 border border-purple-500 rounded text-[10px] uppercase font-bold tracking-wider text-white transition-colors'
          }, 'Browse Again')
        )
      );
    }

    return null;
  };

  // Register in TuxShow accordion panel list
  window.tuxShowRegistry.registerInspectorTab({
    id: 'panic-proof-importer',
    name: '"Panic-Proof" Slide Importer',
    icon: h('svg', { className: 'w-3.5 h-3.5 text-purple-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
      h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 7v12m0 0l-4-4m4 4l4-4M16 17V5m0 0l-4 4m4-4l4 4' })
    ),
    renderTab: SlideImporterComponent
  });

  console.log('[Slide Importer] Registered Inspector Tab successfully');
}
