const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

const broken = `                        </Button>
                      </>
                            {currentRun.status === 'Approved' && (`

const fixed = `                        </Button>
                      </>
                    )}
                    {currentRun.status === 'Approved' && (`

code = code.replace(broken, fixed);

fs.writeFileSync('src/pages/Payroll.tsx', code);
